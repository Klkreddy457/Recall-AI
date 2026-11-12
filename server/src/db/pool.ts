import { Pool, type PoolConfig } from 'pg';
import { config as defaultConfig, type EnvConfig } from '../config/env.js';

let poolInstance: Pool | null = null;

export function createPool(cfg: EnvConfig = defaultConfig): Pool {
  const poolConfig: PoolConfig = {
    connectionString: cfg.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  };

  if (cfg.DATABASE_SSL) {
    poolConfig.ssl = { rejectUnauthorized: false };
  }

  return new Pool(poolConfig);
}

export function getPool(cfg?: EnvConfig): Pool {
  if (!poolInstance) {
    poolInstance = createPool(cfg);
  }
  return poolInstance;
}

export async function closePool(): Promise<void> {
  if (poolInstance) {
    await poolInstance.end();
    poolInstance = null;
  }
}

