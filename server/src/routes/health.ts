import type { FastifyPluginAsync } from 'fastify';
import type { Pool } from 'pg';

export const healthRoutes: (pool: Pool) => FastifyPluginAsync = (pool) => async (fastify) => {
  const handler = async (_request: unknown, reply: { status: (code: number) => { send: (body: unknown) => unknown } }) => {
    try {
      const res = await pool.query('SELECT 1 as healthy');
      if (res.rows[0]?.healthy === 1) {
        return reply.status(200).send({
          status: 'ok',
          db: 'connected',
          connected: true,
          timestamp: new Date().toISOString(),
        });
      }
      return reply.status(503).send({
        status: 'error',
        db: 'disconnected',
        connected: false,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      requestErrorLog(fastify, err);
      return reply.status(503).send({
        status: 'error',
        db: 'disconnected',
        connected: false,
        error: (err as Error).message,
        timestamp: new Date().toISOString(),
      });
    }
  };

  fastify.get('/health', handler);
  fastify.get('/api/health', handler);
};

function requestErrorLog(fastify: { log: { error: (msg: unknown) => void } }, err: unknown) {
  fastify.log.error(err);
}

