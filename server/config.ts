import 'dotenv/config';
import { z } from 'zod';
const configSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  OLLAMA_BASE_URL: z.url().default('http://localhost:11434'),
  OLLAMA_MODEL: z.string().min(1).default('qwen3:4b-instruct'),
  LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300000).default(60000),
  DATABASE_PATH: z.string().default('./data/mailbox.sqlite'),
  AUTO_PROCESS: z.enum(['true', 'false']).default('true'),
});
export const config = configSchema.parse(process.env);
