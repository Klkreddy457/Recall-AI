import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import type { Pool } from 'pg';
import {
  ownerHeaderSchema,
  conversationIdParamSchema,
  createConversationSchema,
  listConversationsQuerySchema,
} from '../schemas/api.js';
import { type DataStore, PostgresDataStore } from '../db/store.js';

function getOwnerId(request: FastifyRequest, reply: FastifyReply): string | null {
  const parsedHeaders = ownerHeaderSchema.safeParse(request.headers);
  if (!parsedHeaders.success) {
    reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Missing or invalid x-owner-id header (must be a valid UUID)',
      issues: parsedHeaders.error.issues,
    });
    return null;
  }
  return parsedHeaders.data['x-owner-id'];
}

export const conversationRoutes: (storeOrPool: DataStore | Pool) => FastifyPluginAsync =
  (storeOrPool) => async (fastify) => {
    const store: DataStore =
      'query' in storeOrPool ? new PostgresDataStore(storeOrPool) : storeOrPool;

    // GET /api/conversations
    fastify.get('/api/conversations', async (request, reply) => {
      const ownerId = getOwnerId(request, reply);
      if (!ownerId) return;

      const queryParsed = listConversationsQuerySchema.safeParse(request.query);
      if (!queryParsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid query parameters',
          issues: queryParsed.error.issues,
        });
      }

      const { search } = queryParsed.data;
      const conversations = await store.listConversations(ownerId, search);
      return reply.status(200).send({ conversations });
    });

    // POST /api/conversations
    fastify.post('/api/conversations', async (request, reply) => {
      const ownerId = getOwnerId(request, reply);
      if (!ownerId) return;

      const bodyParsed = createConversationSchema.safeParse(request.body ?? {});
      if (!bodyParsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid request body',
          issues: bodyParsed.error.issues,
        });
      }

      const title = bodyParsed.data.title ?? 'New Conversation';
      const conversation = await store.createConversation(ownerId, title);

      return reply.status(201).send({ conversation });
    });

    // DELETE /api/conversations/:id
    fastify.delete('/api/conversations/:id', async (request, reply) => {
      const ownerId = getOwnerId(request, reply);
      if (!ownerId) return;

      const paramsParsed = conversationIdParamSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid conversation id parameter',
          issues: paramsParsed.error.issues,
        });
      }

      const { id } = paramsParsed.data;
      const deleted = await store.deleteConversation(id, ownerId);

      if (!deleted) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Conversation not found',
        });
      }

      return reply.status(204).send();
    });

    // GET /api/conversations/:id/messages
    fastify.get('/api/conversations/:id/messages', async (request, reply) => {
      const ownerId = getOwnerId(request, reply);
      if (!ownerId) return;

      const paramsParsed = conversationIdParamSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid conversation id parameter',
          issues: paramsParsed.error.issues,
        });
      }

      const { id } = paramsParsed.data;

      const conv = await store.getConversation(id, ownerId);
      if (!conv) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Conversation not found',
        });
      }

      const messages = await store.listMessages(id);
      return reply.status(200).send({ messages });
    });
  };
