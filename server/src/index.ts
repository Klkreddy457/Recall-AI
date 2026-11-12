import { buildApp } from './app.js';
import { config } from './config/env.js';
import { getPool, closePool } from './db/pool.js';
import { runMigrations } from './db/migrate.js';

async function main() {
  const pool = getPool(config);

  // Run migrations on server startup
  console.log('Running database migrations...');
  await runMigrations(pool);
  console.log('Database migrations complete.');

  const app = await buildApp({ pool });

  const address = await app.listen({
    port: config.PORT,
    host: config.HOST,
  });

  console.log(`Server listening at ${address}`);

  const shutdown = async (signal: string) => {
    console.log(`\nReceived ${signal}, closing server and db connections...`);
    await app.close();
    await closePool();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Fatal error starting server:', err);
  process.exit(1);
});

