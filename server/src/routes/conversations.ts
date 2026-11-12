import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import type { Pool } from 'pg';
import {
  ownerHeaderSchema,
  conversationIdParamSchema,
  createConversationSchema,
  listConversationsQuerySchema,
} from '../schemas/api.js';

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

export const conversationRoutes: (pool: Pool) => FastifyPluginAsync = (pool) => async (fastify) => {
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

    let querySql = `
      SELECT id, owner_id, title, created_at, updated_at
      FROM conversations
      WHERE owner_id = $1
    `;
    const params: (string | number)[] = [ownerId];

    if (search && search.length > 0) {
      params.push(`%${search}%`);
      querySql += ` AND title ILIKE $${params.length}`;
    }

    querySql += ` ORDER BY updated_at DESC`;

    const result = await pool.query(querySql, params);
    return reply.status(200).send({ conversations: result.rows });
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

    const result = await pool.query(
      `
      INSERT INTO conversations (owner_id, title)
      VALUES ($1, $2)
      RETURNING id, owner_id, title, created_at, updated_at
      `,
      [ownerId, title]
    );

    return reply.status(201).send({ conversation: result.rows[0] });
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

    const result = await pool.query(
      `
      DELETE FROM conversations
      WHERE id = $1 AND owner_id = $2
      RETURNING id
      `,
      [id, ownerId]
    );

    if (result.rowCount === 0) {
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

    // First ensure the conversation belongs to the owner
    const convCheck = await pool.query(
      `SELECT id FROM conversations WHERE id = $1 AND owner_id = $2`,
      [id, ownerId]
    );

    if (convCheck.rowCount === 0) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'Conversation not found',
      });
    }

    const messagesResult = await pool.query(
      `
      SELECT id, conversation_id, role, content, status, created_at, sources_json, search_metadata
      FROM messages
      WHERE conversation_id = $1
      ORDER BY created_at ASC
      `,
      [id]
    );

    return reply.status(200).send({ messages: messagesResult.rows });
  });
};

