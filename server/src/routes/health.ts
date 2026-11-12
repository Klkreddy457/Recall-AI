import type { FastifyPluginAsync } from 'fastify';
import type { Pool } from 'pg';

export const healthRoutes: (pool: Pool) => FastifyPluginAsync = (pool) => async (fastify) => {
  fastify.get('/health', async (_request, reply) => {
    try {
      const res = await pool.query('SELECT 1 as healthy');
      if (res.rows[0]?.healthy === 1) {
        return reply.status(200).send({
          status: 'ok',
          db: 'connected',
          timestamp: new Date().toISOString(),
        });
      }
      return reply.status(503).send({
        status: 'error',
        db: 'disconnected',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      requestErrorLog(fastify, err);
      return reply.status(503).send({
        status: 'error',
        db: 'disconnected',
        error: (err as Error).message,
        timestamp: new Date().toISOString(),
      });
    }
  });
};

function requestErrorLog(fastify: { log: { error: (msg: unknown) => void } }, err: unknown) {
  fastify.log.error(err);
}

