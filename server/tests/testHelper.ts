import { Pool } from 'pg';
import { config } from '../src/config/env.js';

export function getTestPool(): Pool {
  const dbUrl = process.env.TEST_DATABASE_URL || config.DATABASE_URL;
  const isSsl = config.DATABASE_SSL || dbUrl.includes('neon.tech') || dbUrl.includes('sslmode=');
  return new Pool({
    connectionString: dbUrl,
    max: 5,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000,
    ssl: isSsl ? { rejectUnauthorized: false } : undefined,
  });
}

export async function resetDatabase(pool: Pool): Promise<void> {
  // Only permit destructive drop if TEST_DATABASE_URL is explicitly configured
  // to avoid modifying or deleting production conversation data
  if (process.env.TEST_DATABASE_URL && process.env.TEST_DATABASE_URL !== config.DATABASE_URL) {
    await pool.query(`
      DROP TABLE IF EXISTS conversation_summaries CASCADE;
      DROP TABLE IF EXISTS messages CASCADE;
      DROP TABLE IF EXISTS conversations CASCADE;
      DROP TABLE IF EXISTS schema_migrations CASCADE;
    `);
  }
}

