import { readFileSync } from 'node:fs';
import { config } from './config.js';
import { createApp } from './app.js';
import { Store } from './storage/store.js';
import { OllamaClient } from './agents/ollama.js';
import { Pipeline } from './pipeline.js';
import { normalizeSeed } from './ingestion/index.js';

const store = new Store(config.DATABASE_PATH);
for (const seed of normalizeSeed(
  JSON.parse(readFileSync(new URL('../data/mock_mailbox_data.json', import.meta.url), 'utf8')),
))
  store.create(seed.input, seed.id);
store.recover();
const model = new OllamaClient(config.OLLAMA_MODEL, config.OLLAMA_BASE_URL, config.LLM_TIMEOUT_MS);
const pipeline = new Pipeline(store, model);
const autoProcess = config.AUTO_PROCESS === 'true';
const server = createApp(store, pipeline, model, autoProcess).listen(
  config.PORT,
  'localhost',
  () => {
    console.log(`Mail Risk Intelligence: http://localhost:${config.PORT}`);
    if (autoProcess) for (const id of store.queued()) pipeline.enqueue(id);
  },
);
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  pipeline.stop();
  server.close();
  // Active work may finish; if killed sooner, startup recovers interrupted stages.
  const force = setTimeout(() => process.exit(0), 5000).unref();
  await pipeline.idle();
  clearTimeout(force);
  store.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
