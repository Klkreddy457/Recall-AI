import { Pool } from 'pg';
import { config } from '../src/config/env.js';

export function getTestPool(): Pool {
  return new Pool({
    connectionString: process.env.TEST_DATABASE_URL || config.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000,
  });
}

export async function resetDatabase(pool: Pool): Promise<void> {
  await pool.query(`
    DROP TABLE IF EXISTS messages CASCADE;
    DROP TABLE IF EXISTS conversations CASCADE;
    DROP TABLE IF EXISTS schema_migrations CASCADE;
  `);
}

