import { readFileSync } from 'node:fs';
import { config } from '../server/config.js';
import { OllamaClient } from '../server/agents/ollama.js';
import { normalizeSeed } from '../server/ingestion/index.js';
import { Store } from '../server/storage/store.js';
import { Pipeline } from '../server/pipeline.js';

const model = new OllamaClient(config.OLLAMA_MODEL, config.OLLAMA_BASE_URL, config.LLM_TIMEOUT_MS);
const health = await model.health();
if (!health.available) {
  console.error(health.message);
  process.exit(1);
}
const store = new Store(':memory:');
const pipeline = new Pipeline(store, model);
const seeds = normalizeSeed(
  JSON.parse(readFileSync(new URL('../data/mock_mailbox_data.json', import.meta.url), 'utf8')),
);
console.log(`Real-model smoke run: ${model.model}. No saved application data is changed.`);
console.log('This checks completion and provenance validation, not classification accuracy.');
let failures = 0;
const started = Date.now();
for (const { id, input } of seeds) {
  const began = Date.now();
  store.create(input, id);
  pipeline.enqueue(id);
  await pipeline.idle();
  const record = store.get(id)!;
  console.log(
    `${id}\t${record.status}\t${record.assessment?.level ?? 'unassessed'}\t${((Date.now() - began) / 1000).toFixed(1)}s${record.error ? `\t${record.error.code}` : ''}`,
  );
  if (record.status !== 'completed') failures++;
}
console.log(
  `Finished in ${((Date.now() - started) / 1000).toFixed(1)}s. ${seeds.length - failures}/${seeds.length} completed. Review rationales in the application separately.`,
);
store.close();
if (failures) process.exitCode = 1;
