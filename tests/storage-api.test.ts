import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../server/storage/store';
import { createApp } from '../server/app';
import { Pipeline } from '../server/pipeline';
import { input, extraction, assessment, assessmentDraft, ScriptedModel, noWait } from './fixtures';
const stores: Store[] = [];
function setup() {
  const store = new Store(':memory:');
  stores.push(store);
  const model = new ScriptedModel([]);
  const pipeline = new Pipeline(store, model, noWait);
  return { store, pipeline, model, app: createApp(store, pipeline, model, false) };
}
afterEach(() => stores.splice(0).forEach((s) => s.close()));
describe('storage and API', () => {
  it('seeds idempotently and recovers interrupted work while preserving extraction', () => {
    const { store } = setup();
    store.create(input, 'seed');
    store.create(input, 'seed');
    expect(store.list()).toHaveLength(1);
    store.saveExtraction('seed', extraction, 'test', '1');
    store.status('seed', 'assessing');
    store.recover();
    expect(store.get('seed')).toMatchObject({ status: 'queued', extraction });
  });
  it('persists results after closing and reopening SQLite', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mail-risk-')),
      path = join(dir, 'test.sqlite');
    try {
      const one = new Store(path);
      one.create(input, 'saved');
      one.saveExtraction('saved', extraction, 'test', '1');
      one.complete('saved', assessment);
      one.close();
      const two = new Store(path);
      try {
        expect(two.get('saved')?.assessment).toEqual(assessment);
        expect(two.graph().edges).toHaveLength(1);
      } finally {
        two.close();
      }
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
  it('merges exact email identifiers but keeps same-name entities separate', () => {
    const { store } = setup();
    for (const id of ['one', 'two']) {
      store.create(input, id);
      store.complete(id, assessment);
    }
    const graph = store.graph();
    expect(graph.nodes).toHaveLength(3);
    expect(graph.nodes.find((n) => n.name === 'Alex')?.emailIds).toEqual(['one', 'two']);
    expect(graph.edges).toHaveLength(2);
  });
  it('rolls back graph writes when a relationship has a missing endpoint', () => {
    const { store } = setup();
    store.create(input, 'mail');
    const broken = structuredClone(assessment);
    broken.relationships[0].targetId = 'missing';
    expect(() => store.complete('mail', broken)).toThrow();
    expect(store.graph().nodes).toHaveLength(0);
    expect(store.get('mail')?.assessment).toBeNull();
  });
  it('creates pasted items immediately without requiring a model', async () => {
    const { app, store } = setup();
    const result = await request(app)
      .post('/api/emails')
      .send({ text: 'A new message for review.' })
      .expect(202);
    expect(store.get(result.body.id)).toMatchObject({ status: 'queued', assessment: null });
    const list = await request(app).get('/api/emails').expect(200);
    expect(list.body.emails[0].risk).toBeNull();
  });
  it('accepts multipart TXT and reports invalid upload input', async () => {
    const { app } = setup();
    await request(app)
      .post('/api/uploads')
      .attach('file', Buffer.from('A message'), 'mail.txt')
      .expect(202);
    await request(app).post('/api/uploads').expect(400);
    await request(app)
      .post('/api/uploads')
      .attach('file', Buffer.from('test'), 'file.exe')
      .expect(400);
  });
  it('returns consistent errors for malformed JSON, empty input, oversized upload and missing IDs', async () => {
    const { app } = setup();
    const malformed = await request(app)
      .post('/api/emails')
      .set('Content-Type', 'application/json')
      .send('{bad')
      .expect(400);
    expect(malformed.body.error.code).toBe('INVALID_JSON');
    await request(app).post('/api/emails').send({ text: '' }).expect(400);
    await request(app).get('/api/emails/missing').expect(404);
    await request(app)
      .post('/api/uploads')
      .attach('file', Buffer.alloc(5 * 1024 * 1024 + 1), 'big.txt')
      .expect(413);
  });
  it('blocks cross-origin writes without breaking same-origin requests', async () => {
    const { app } = setup();
    await request(app)
      .post('/api/emails')
      .set('Origin', 'https://untrusted.example')
      .send({ text: 'test' })
      .expect(403);
    await request(app)
      .post('/api/emails')
      .set('Origin', 'http://localhost:5173')
      .send({ text: 'test' })
      .expect(202);
  });
  it('retries failed items and rejects completed items', async () => {
    const { app, store, model, pipeline } = setup();
    store.create(input, 'mail');
    store.saveExtraction('mail', extraction, 'test', '1');
    store.fail('mail', { code: 'TIMEOUT', stage: 'assessment', message: 'Timeout' });
    model.replies.push(JSON.stringify(assessmentDraft));
    await request(app).post('/api/emails/mail/retry').expect(202);
    await pipeline.idle();
    await request(app).post('/api/emails/mail/retry').expect(409);
  });
});
