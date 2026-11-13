import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Load .env from root or local if present
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/recall_ai'),
  DATABASE_SSL: z
    .preprocess((val) => {
      if (typeof val === 'string') {
        return val.toLowerCase() === 'true' || val === '1';
      }
      return Boolean(val);
    }, z.boolean())
    .default(false),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  OPENAI_API_KEY: z.string().optional().default(''),
  OPENAI_BASE_URL: z.string().optional().default(''),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  TAVILY_API_KEY: z.string().optional().default(''),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_WINDOW: z.string().default('1 minute'),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function loadConfig(overrides?: Partial<EnvConfig>): EnvConfig {
  const rawEnv = {
    ...process.env,
    ...overrides,
  };

  const parsed = envSchema.safeParse(rawEnv);
  if (!parsed.success) {
    const errorDetails = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${errorDetails}`);
  }

  return parsed.data;
}

export const config = loadConfig();

