import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import 'dotenv/config';

const action = process.argv[2] ?? 'serve';
if (!['serve', 'pull'].includes(action))
  throw new Error('Usage: node scripts/model.mjs serve|pull');
const localRuntime = resolve('work/runtime/ollama');
const executable = existsSync(localRuntime) ? localRuntime : 'ollama';
const models = resolve('work/models');
mkdirSync(models, { recursive: true });
const child = spawn(
  executable,
  action === 'pull' ? ['pull', process.env.OLLAMA_MODEL ?? 'qwen3:4b-instruct'] : ['serve'],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      OLLAMA_MODELS: models,
      OLLAMA_HOST: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434',
      OLLAMA_NO_CLOUD: '1',
    },
  },
);
child.on('error', () => {
  console.error(
    'Ollama was not found. Install it from https://ollama.com/download, then try again.',
  );
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
