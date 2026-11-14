import type { Pool } from 'pg';
import type { LLMClient, ChatMessage } from '../services/llm/types.js';
import { WEB_SEARCH_TOOL } from '../services/llm/types.js';
import type { SearchClient, SearchResult, SourceCard } from '../services/search/types.js';
import { retrieve } from '../services/memory/retrieval.js';
import type { MemoryRetrievalResult } from '../services/memory/types.js';
import { ContextBuilder } from './context.js';
import { validateAndStripCitations, buildSourceCards } from './citations.js';
import { extractValidJsonObject, normalizeSearchQuery } from './jsonSanitizer.js';

export interface TurnTimings {
  totalMs: number;
  timeToFirstEventMs: number | null;
  timeToFirstTokenMs: number | null;
  memoryMs: number;
  searchMs: number;
}

export type AgentEvent =
  | { type: 'status'; message: string }
  | { type: 'token'; content: string }
  | { type: 'sources'; sources: SourceCard[] }
  | {
      type: 'complete';
      content: string;
      sources: SourceCard[];
      timings: TurnTimings;
      status: 'complete' | 'interrupted' | 'error';
    }
  | { type: 'error'; error: string };

export interface RunTurnParams {
  ownerId: string;
  conversationId: string;
  query: string;
  timezone?: string;
  signal?: AbortSignal;
  now?: Date;
  memoryResult?: MemoryRetrievalResult;
  pool?: Pool;
}

export interface OrchestratorDependencies {
  llmClient: LLMClient;
  searchClient: SearchClient;
  contextBuilder?: ContextBuilder;
}

export class AgentOrchestrator {
  private llmClient: LLMClient;
  private searchClient: SearchClient;
  private contextBuilder: ContextBuilder;

  constructor(deps: OrchestratorDependencies) {
    this.llmClient = deps.llmClient;
    this.searchClient = deps.searchClient;
    this.contextBuilder = deps.contextBuilder || new ContextBuilder();
  }

  async *runTurn(params: RunTurnParams): AsyncGenerator<AgentEvent, void, unknown> {
    const turnStart = performance.now();
    let timeToFirstEventMs: number | null = null;
    let timeToFirstTokenMs: number | null = null;
    let memoryMs = 0;
    let searchMs = 0;

    let fullAssistantContent = '';
    let searchResults: SearchResult[] = [];
    let sources: SourceCard[] = [];
    let searchCallCount = 0;

    const recordFirstEvent = () => {
      if (timeToFirstEventMs === null) {
        timeToFirstEventMs = Math.round((performance.now() - turnStart) * 100) / 100;
      }
    };

    try {
      if (params.signal?.aborted) {
        throw new Error('Aborted before starting');
      }

      // Step 1: Memory Retrieval (Decision 2 parallel retrieval)
      let memory: MemoryRetrievalResult;
      if (params.memoryResult) {
        memory = params.memoryResult;
        memoryMs = memory.timings.totalMs;
      } else if (params.pool) {
        const memStart = performance.now();
        try {
          memory = await retrieve(params.pool, {
            ownerId: params.ownerId,
            query: params.query,
            activeConversationId: params.conversationId,
            timezone: params.timezone,
            now: params.now,
          });
          memoryMs = Math.round((performance.now() - memStart) * 100) / 100;
        } catch {
          memory = {
            recentContext: [],
            temporal: null,
            fts: [],
            memoryEmptySignal: false,
            timings: { totalMs: 0, recentMs: 0, temporalMs: 0, ftsMs: 0 },
          };
        }
      } else {
        memory = {
          recentContext: [],
          temporal: null,
          fts: [],
          memoryEmptySignal: false,
          timings: { totalMs: 0, recentMs: 0, temporalMs: 0, ftsMs: 0 },
        };
      }

      // Step 2: Build Context & Prompt
      const messages: ChatMessage[] = this.contextBuilder.buildMessages({
        query: params.query,
        now: params.now,
        timezone: params.timezone,
        memory,
      });

      // Step 3: Stream initial turn from LLM
      let activeToolCall: { id: string; name: string; arguments: string } | null = null;

      const runLLMStream = async function* (
        orchestrator: AgentOrchestrator,
        currentMessages: ChatMessage[]
      ): AsyncGenerator<AgentEvent, { toolCall: typeof activeToolCall }, void> {
        let localToolCall: typeof activeToolCall = null;

        for await (const chunk of orchestrator.llmClient.streamChat(
          currentMessages,
          [WEB_SEARCH_TOOL],
          params.signal
        )) {
          if (params.signal?.aborted) {
            throw new Error('Aborted');
          }

          if (chunk.token) {
            recordFirstEvent();
            if (timeToFirstTokenMs === null) {
              timeToFirstTokenMs = Math.round((performance.now() - turnStart) * 100) / 100;
            }
            fullAssistantContent += chunk.token;
            yield { type: 'token', content: chunk.token };
          }

          if (chunk.toolCallDelta) {
            recordFirstEvent();
            if (!localToolCall) {
              localToolCall = {
                id: chunk.toolCallDelta.id || `call_${Date.now()}`,
                name: chunk.toolCallDelta.name || '',
                arguments: '',
              };
            }
            if (chunk.toolCallDelta.argumentsDelta) {
              localToolCall.arguments += chunk.toolCallDelta.argumentsDelta;
            }
          }
        }

        return { toolCall: localToolCall };
      };

      // Execute first stream
      const firstStream = runLLMStream(this, messages);
      let streamResult = await firstStream.next();
      while (!streamResult.done) {
        yield streamResult.value;
        streamResult = await firstStream.next();
      }

      activeToolCall = streamResult.value.toolCall;

      // In-turn search cache to deduplicate searches in the same turn (Bug D)
      const inTurnSearchCache = new Map<string, SearchResult[]>();

      // Step 4: Handle Tool Call (Decision 1 & 3: Exactly one tool web_search, max 1 search per turn)
      if (activeToolCall && activeToolCall.name === 'web_search') {
        searchCallCount++;

        if (searchCallCount > 1) {
          // Hard cap: maximum 1 search per turn
          const toolErrorMessage: ChatMessage = {
            role: 'tool',
            tool_call_id: activeToolCall.id,
            name: 'web_search',
            content: 'Error: Maximum of 1 web search allowed per turn.',
          };
          messages.push(toolErrorMessage);
        } else {
          // Robust JSON argument extraction and sanitization (Bug E)
          const fallbackArgs = { query: params.query };
          const { parsed: parsedArgs, cleanString: cleanToolArguments } = extractValidJsonObject<{
            query?: string;
          }>(activeToolCall.arguments, fallbackArgs);

          let searchQuery = params.query;
          if (parsedArgs.query && typeof parsedArgs.query === 'string' && parsedArgs.query.trim().length > 0) {
            searchQuery = parsedArgs.query.trim();
          }

          recordFirstEvent();
          yield { type: 'status', message: `Searching web for "${searchQuery}"...` };

          const searchStart = performance.now();
          let searchToolContent: string;

          try {
            const normalizedQuery = normalizeSearchQuery(searchQuery);

            if (inTurnSearchCache.has(normalizedQuery)) {
              // Deduplicated in-turn search hit
              searchResults = inTurnSearchCache.get(normalizedQuery)!;
            } else {
              searchResults = await this.searchClient.search(searchQuery, params.signal);
              inTurnSearchCache.set(normalizedQuery, searchResults);
            }

            sources = buildSourceCards(searchResults);

            if (sources.length > 0) {
              yield { type: 'sources', sources };
            }

            const toolMsg = this.contextBuilder.formatSearchResultsAsToolMessage(
              activeToolCall.id,
              searchResults
            );
            searchToolContent = toolMsg.content;
          } catch {
            // Decision: Timeout or provider error becomes "search unavailable"
            searchResults = [];
            sources = [];
            searchToolContent = 'search unavailable';
          } finally {
            searchMs = Math.round((performance.now() - searchStart) * 100) / 100;
          }

          // Append assistant tool call and tool response to conversation
          // Guaranteed: cleanToolArguments is strictly valid JSON, eliminating Groq 400 template errors
          const assistantToolCallMsg: ChatMessage = {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: activeToolCall.id,
                type: 'function',
                function: {
                  name: activeToolCall.name,
                  arguments: cleanToolArguments,
                },
              },
            ],
          };

          const toolResponseMsg: ChatMessage = {
            role: 'tool',
            tool_call_id: activeToolCall.id,
            name: 'web_search',
            content: searchToolContent,
          };

          messages.push(assistantToolCallMsg);
          messages.push(toolResponseMsg);

          // Reset assistant text for second turn
          fullAssistantContent = '';

          // Stream second turn from LLM with tool results
          const secondStream = runLLMStream(this, messages);
          let secondResult = await secondStream.next();
          while (!secondResult.done) {
            yield secondResult.value;
            secondResult = await secondStream.next();
          }

          // Guard against model attempting another tool call in second turn
          const secondToolCall = secondResult.value.toolCall;
          if (secondToolCall && secondToolCall.name === 'web_search') {
            searchCallCount++;
            messages.push({
              role: 'assistant',
              content: '',
              tool_calls: [
                {
                  id: secondToolCall.id,
                  type: 'function',
                  function: {
                    name: secondToolCall.name,
                    arguments: JSON.stringify({ query: '' }),
                  },
                },
              ],
            });
            messages.push({
              role: 'tool',
              tool_call_id: secondToolCall.id,
              name: 'web_search',
              content: 'Error: Maximum of 1 web search allowed per turn.',
            });
          }
        }
      }

      // Step 5: Citation Validation
      // Any [n] where n is not in this turn's backend results is stripped
      const validatedContent = validateAndStripCitations(fullAssistantContent, searchResults.length);

      const totalMs = Math.round((performance.now() - turnStart) * 100) / 100;
      const timings: TurnTimings = {
        totalMs,
        timeToFirstEventMs: timeToFirstEventMs ?? totalMs,
        timeToFirstTokenMs: timeToFirstTokenMs ?? totalMs,
        memoryMs,
        searchMs,
      };

      yield {
        type: 'complete',
        content: validatedContent,
        sources,
        timings,
        status: 'complete',
      };
    } catch (err) {
      const isAbort =
        params.signal?.aborted ||
        (err as Error).name === 'AbortError' ||
        (err as Error).message.includes('aborted');

      const totalMs = Math.round((performance.now() - turnStart) * 100) / 100;
      const validatedContent = validateAndStripCitations(fullAssistantContent, searchResults.length);

      const timings: TurnTimings = {
        totalMs,
        timeToFirstEventMs: timeToFirstEventMs ?? totalMs,
        timeToFirstTokenMs: timeToFirstTokenMs ?? totalMs,
        memoryMs,
        searchMs,
      };

      if (isAbort) {
        yield {
          type: 'complete',
          content: validatedContent,
          sources,
          timings,
          status: 'interrupted',
        };
      } else {
        yield {
          type: 'error',
          error: (err as Error).message || 'An unexpected error occurred during turn processing',
        };
      }
    }
  }
}

