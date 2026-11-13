import { randomUUID } from 'crypto';
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import type { Pool } from 'pg';
import { ownerHeaderSchema, chatRequestSchema } from '../schemas/api.js';
import { AgentOrchestrator, type TurnTimings } from '../agent/orchestrator.js';
import type { SourceCard } from '../services/search/types.js';
import { type DataStore, PostgresDataStore, globalInMemoryStore } from '../db/store.js';

export interface ChatRouteOptions {
  pool?: Pool;
  store?: DataStore;
  orchestrator: AgentOrchestrator;
  rateLimitMax?: number;
  rateLimitWindow?: string;
}

export const chatRoutes: (opts: ChatRouteOptions) => FastifyPluginAsync =
  (opts) => async (fastify) => {
    const { orchestrator } = opts;
    const store: DataStore = opts.store
      ? opts.store
      : opts.pool
      ? new PostgresDataStore(opts.pool)
      : globalInMemoryStore;

    fastify.post(
      '/api/chat',
      {
        config: {
          rateLimit: {
            max: opts.rateLimitMax ?? 60,
            timeWindow: opts.rateLimitWindow ?? '1 minute',
          },
        },
      },
      async (request: FastifyRequest, reply: FastifyReply) => {
        // Step 1: Validate Header (x-owner-id)
        const parsedHeader = ownerHeaderSchema.safeParse(request.headers);
        if (!parsedHeader.success) {
          return reply.status(400).send({
            statusCode: 400,
            error: 'Bad Request',
            message: 'Missing or invalid x-owner-id header (must be a valid UUID)',
            issues: parsedHeader.error.issues,
          });
        }
        const ownerId = parsedHeader.data['x-owner-id'];

        // Step 2: Validate Body
        const parsedBody = chatRequestSchema.safeParse(request.body);
        if (!parsedBody.success) {
          return reply.status(400).send({
            statusCode: 400,
            error: 'Bad Request',
            message: 'Invalid request body',
            issues: parsedBody.error.issues,
          });
        }
        const { message: query, timezone = 'UTC' } = parsedBody.data;
        let conversationId = parsedBody.data.conversationId;

        // Step 3: Conversation Setup & Ownership Verification
        let needsAutoTitle = false;

        try {
          if (conversationId) {
            const existing = await store.getConversation(conversationId, ownerId);
            if (!existing) {
              return reply.status(404).send({
                statusCode: 404,
                error: 'Not Found',
                message: 'Conversation not found or access denied',
              });
            }
            if (!existing.title || existing.title === 'New Conversation') {
              needsAutoTitle = true;
            }
          } else {
            // First turn: auto-title from the first prompt excerpt
            const generatedTitle =
              query.length > 50 ? query.slice(0, 50).trim() + '...' : query.trim();
            const created = await store.createConversation(ownerId, generatedTitle);
            conversationId = created.id;
          }

          // Step 4: Persist User Message at Turn Start
          if (conversationId) {
            await store.insertMessage({
              id: randomUUID(),
              conversation_id: conversationId,
              role: 'user',
              content: query,
              status: 'complete',
            });
          }
        } catch (err) {
          if (!conversationId) {
            conversationId = randomUUID();
          }
        }

        // Step 5: Setup SSE Streaming & Abort Handling
        const abortController = new AbortController();

        request.raw.on('close', () => {
          if (!request.raw.destroyed) {
            abortController.abort();
          }
        });

        // Set raw SSE headers
        reply.raw.setHeader('Content-Type', 'text/event-stream');
        reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
        reply.raw.setHeader('Connection', 'keep-alive');
        reply.raw.setHeader('X-Accel-Buffering', 'no');
        reply.raw.flushHeaders();

        // State tracking across streaming events
        let fullAssistantContent = '';
        let lastSources: SourceCard[] = [];
        let turnStatus: 'complete' | 'interrupted' | 'error' = 'complete';
        let lastTimings: TurnTimings = {
          totalMs: 0,
          timeToFirstEventMs: null,
          timeToFirstTokenMs: null,
          memoryMs: 0,
          searchMs: 0,
        };

        const activeConversationId = conversationId || randomUUID();

        try {
          const turnStream = orchestrator.runTurn({
            ownerId,
            conversationId: activeConversationId,
            query,
            timezone,
            signal: abortController.signal,
            pool: opts.pool,
          });

          for await (const event of turnStream) {
            if (event.type === 'token') {
              fullAssistantContent += event.content;
            } else if (event.type === 'sources') {
              lastSources = event.sources;
            } else if (event.type === 'complete') {
              turnStatus = event.status;
              lastTimings = event.timings;
              fullAssistantContent = event.content;
            } else if (event.type === 'error') {
              turnStatus = 'error';
            }

            const payload =
              event.type === 'complete' ? { ...event, conversationId } : event;
            const sseChunk = `event: ${event.type}\ndata: ${JSON.stringify(payload)}\n\n`;
            reply.raw.write(sseChunk);
          }
        } catch (err) {
          const isAbort =
            abortController.signal.aborted ||
            (err as Error).name === 'AbortError' ||
            (err as Error).message.includes('aborted');

          turnStatus = isAbort ? 'interrupted' : 'error';

          const errorPayload = {
            type: isAbort ? 'complete' : 'error',
            status: turnStatus,
            content: fullAssistantContent,
            sources: lastSources,
            timings: lastTimings,
            error: isAbort ? undefined : (err as Error).message,
          };
          reply.raw.write(`event: ${errorPayload.type}\ndata: ${JSON.stringify(errorPayload)}\n\n`);
        } finally {
          // Step 6: Persist Assistant Message at Turn End
          if (conversationId) {
            try {
              if (needsAutoTitle) {
                const autoTitle =
                  query.length > 50 ? query.slice(0, 50).trim() + '...' : query.trim();
                await store.updateConversation(conversationId, { title: autoTitle });
              } else {
                await store.updateConversation(conversationId, {});
              }

              const searchMetadata = {
                total_ms: lastTimings.totalMs,
                time_to_first_event: lastTimings.timeToFirstEventMs,
                time_to_first_token: lastTimings.timeToFirstTokenMs,
                memory_ms: lastTimings.memoryMs,
                search_ms: lastTimings.searchMs,
              };

              await store.insertMessage({
                id: randomUUID(),
                conversation_id: conversationId,
                role: 'assistant',
                content: fullAssistantContent,
                status: turnStatus,
                sources_json: lastSources.length > 0 ? lastSources : null,
                search_metadata: searchMetadata,
              });
            } catch {
              // Ignore store error
            }
          }

          // Close the raw SSE stream
          reply.raw.end();
        }
      }
    );
  };
