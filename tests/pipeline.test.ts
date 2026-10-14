import { afterEach, describe, expect, it, vi } from 'vitest';
import { Extraction } from '../shared/contracts';
import { callStructured, OllamaClient } from '../server/agents/ollama';
import { validateAssessment, validateExtraction } from '../server/agents/validation';
import { ModelError } from '../server/errors';
import { Pipeline } from '../server/pipeline';
import { Store } from '../server/storage/store';
import { input, extraction, assessment, assessmentDraft, ScriptedModel, noWait } from './fixtures';
const stores: Store[] = [];
function store() {
  const s = new Store(':memory:');
  stores.push(s);
  return s;
}
afterEach(() => {
  stores.splice(0).forEach((s) => s.close());
  vi.restoreAllMocks();
});
describe('two-stage pipeline', () => {
  it('chains validated A output into B, persists graph and never sends raw input to B', async () => {
    const s = store(),
      model = new ScriptedModel([JSON.stringify(extraction), JSON.stringify(assessmentDraft)]);
    s.create(input, 'mail');
    const pipeline = new Pipeline(s, model, noWait);
    pipeline.enqueue('mail');
    await pipeline.idle();
    expect(s.get('mail')?.status).toBe('completed');
    expect(model.calls).toHaveLength(2);
    expect(model.calls[1].input).toEqual(extraction);
    expect(model.calls[1].input).not.toHaveProperty('body');
    expect(s.graph().edges).toHaveLength(1);
  });
  it('preserves A on B failure and retries only B', async () => {
    const s = store(),
      model = new ScriptedModel([
        JSON.stringify(extraction),
        new ModelError('MODEL_MISSING', 'Missing model'),
        JSON.stringify(assessmentDraft),
      ]);
    s.create(input, 'mail');
    const pipeline = new Pipeline(s, model, noWait);
    pipeline.enqueue('mail');
    await pipeline.idle();
    expect(s.get('mail')).toMatchObject({
      status: 'failed',
      extraction,
      assessment: null,
      error: { stage: 'assessment' },
    });
    pipeline.enqueue('mail');
    await pipeline.idle();
    expect(s.get('mail')?.status).toBe('completed');
    expect(model.calls).toHaveLength(3);
    expect(model.calls[2].input).toEqual(extraction);
  });
  it('fails without a safe risk label when extraction is invalid twice', async () => {
    const s = store(),
      model = new ScriptedModel(['garbage', '{}']);
    s.create(input, 'mail');
    const pipeline = new Pipeline(s, model, noWait);
    pipeline.enqueue('mail');
    await pipeline.idle();
    expect(s.list()[0]).toMatchObject({ status: 'failed', risk: null });
    expect(model.calls).toHaveLength(2);
    expect(model.calls[1].repair).toBeTruthy();
  });
  it('retries transient failures twice with exponential backoff', async () => {
    const model = new ScriptedModel([
      new ModelError('MODEL_TIMEOUT', 'Timeout', true),
      new ModelError('MODEL_HTTP_ERROR', 'Busy', true),
      JSON.stringify(extraction),
    ]);
    const wait = vi.fn(noWait);
    const result = await callStructured(model, 'system', input, Extraction, () => {}, wait);
    expect(result).toEqual(extraction);
    expect(wait.mock.calls).toEqual([[1000], [2000]]);
  });
  it('stops after three transient attempts', async () => {
    const model = new ScriptedModel(
      Array.from({ length: 3 }, () => new ModelError('MODEL_TIMEOUT', 'Timeout', true)),
    );
    await expect(
      callStructured(model, 'system', input, Extraction, () => {}, noWait),
    ).rejects.toMatchObject({ code: 'MODEL_TIMEOUT' });
    expect(model.calls).toHaveLength(3);
  });
  it('rejects fabricated source quotes and dangling relationships', () => {
    const bad = structuredClone(extraction);
    bad.facts[0].evidence.quote = 'A fabricated quote';
    expect(() => validateExtraction(bad, input)).toThrow('verbatim');
    const dangling = structuredClone(assessment);
    dangling.relationships[0].targetId = 'missing';
    expect(() => validateAssessment(dangling, extraction)).toThrow('unknown entity');
    const fabricated = structuredClone(assessment);
    fabricated.evidence[0].quote = 'Not in A';
    expect(() => validateAssessment(fabricated, extraction)).toThrow('source/quote');
  });
  it('corrects a mislabeled source only when an exact quote has a unique source', () => {
    const mislabeled = structuredClone(extraction);
    mislabeled.facts[0].evidence.source = 'headers';
    validateExtraction(mislabeled, input);
    expect(mislabeled.facts[0].evidence.source).toBe('body');
  });
  it('uses deterministic envelope headers over model guesses', () => {
    const wrong = structuredClone(extraction);
    wrong.sender = 'invented@example.org';
    validateExtraction(wrong, input);
    expect(wrong.sender).toBe(input.sender);
  });
  it('does not enqueue the same running item twice', async () => {
    const s = store(),
      model = new ScriptedModel([JSON.stringify(extraction), JSON.stringify(assessmentDraft)]);
    s.create(input, 'mail');
    const p = new Pipeline(s, model, noWait);
    p.enqueue('mail');
    p.enqueue('mail');
    await p.idle();
    expect(model.calls).toHaveLength(2);
  });
  it('maps a timeout to a retryable model failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new DOMException('Timed out', 'TimeoutError'));
    await expect(
      new OllamaClient('model', 'http://localhost').generate({ system: '', input: {}, schema: {} }),
    ).rejects.toMatchObject({ code: 'MODEL_TIMEOUT', retryable: true });
  });
  it('does not retry a missing model or configuration error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 404 }));
    await expect(
      new OllamaClient('missing', 'http://localhost').generate({
        system: '',
        input: {},
        schema: {},
      }),
    ).rejects.toMatchObject({ code: 'MODEL_MISSING', retryable: false });
  });
});

describe('assessment evidence references', () => {
  it('resolves fact indexes to original validated quotes and rejects out-of-range indexes', async () => {
    const { assessmentSchema, resolveAssessment } = await import('../server/agents/assessment');
    const schema = assessmentSchema(extraction);
    const resolved = resolveAssessment(schema.parse(assessmentDraft), extraction);
    expect(resolved.evidence).toEqual(assessment.evidence);
    expect(resolved.entities[0].evidence).toEqual(extraction.facts[0].evidence);
    expect(() => schema.parse({ ...assessmentDraft, evidenceFactIndexes: [99] })).toThrow();
  });
});

describe('source coverage', () => {
  it('rejects an extraction that ignores the body in favor of an attachment', () => {
    const onlyAttachment = structuredClone(extraction);
    onlyAttachment.facts = [
      {
        kind: 'amount',
        value: '$500',
        attribution: null,
        evidence: { source: 'invoice.pdf', quote: '$500' },
      },
    ];
    expect(() =>
      validateExtraction(onlyAttachment, {
        ...input,
        attachments: [{ filename: 'invoice.pdf', text: '$500', warning: null }],
      }),
    ).toThrow('Missing facts from source "body"');
  });
});

describe('duplicate entity mentions', () => {
  it('collapses exact repeated mentions but rejects ambiguous reused IDs', async () => {
    const { resolveAssessment } = await import('../server/agents/assessment');
    const repeated = structuredClone(assessmentDraft);
    repeated.entities.push(structuredClone(repeated.entities[0]));
    expect(resolveAssessment(repeated, extraction).entities).toHaveLength(2);
    repeated.entities[2].name = 'A different person';
    expect(() => resolveAssessment(repeated, extraction)).toThrow('different entities');
  });
});

describe('optional entity merge identifiers', () => {
  it('keeps grounded email keys and drops unsafe optional identifiers', async () => {
    const { resolveAssessment } = await import('../server/agents/assessment');
    const draft = structuredClone(assessmentDraft);
    draft.entities.push(
      {
        id: 'account',
        type: 'account',
        name: 'Account',
        identifier: 'alex@example.com',
        evidenceFactIndex: 0,
      },
      {
        id: 'unknown',
        type: 'person',
        name: 'Unknown',
        identifier: 'unknown@example.com',
        evidenceFactIndex: 0,
      },
      {
        id: 'partial',
        type: 'organization',
        name: 'Partial',
        identifier: '9902',
        evidenceFactIndex: 0,
      },
    );
    expect(resolveAssessment(draft, extraction).entities.map((e) => e.identifier)).toEqual([
      'alex@example.com',
      null,
      null,
      null,
      null,
    ]);
  });
});

describe('line-wrapped evidence', () => {
  it('restores exact original whitespace without changing words or punctuation', () => {
    const wrapped = structuredClone(input);
    wrapped.body = 'Please send $500\r\n  to Example Ltd today.';
    const result = structuredClone(extraction);
    validateExtraction(result, wrapped);
    expect(result.facts[0].evidence.quote).toBe(wrapped.body);
    expect(result.facts[0].evidence.source).toBe('body');
  });
  it('rejects changed content and ambiguous whitespace matches', () => {
    const wrapped = structuredClone(input);
    wrapped.body = 'Please send $500\n to Example Ltd today.';
    const changed = structuredClone(extraction);
    changed.facts[0].evidence.quote = 'Please send $900 to Example Ltd today.';
    expect(() => validateExtraction(changed, wrapped)).toThrow('verbatim');
    wrapped.attachments = [{ filename: 'duplicate.txt', text: wrapped.body, warning: null }];
    expect(() => validateExtraction(structuredClone(extraction), wrapped)).toThrow('verbatim');
  });
});
