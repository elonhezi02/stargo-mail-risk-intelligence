import { assessmentSchema, resolveAssessment } from './agents/assessment.js';
import { Extraction } from '../shared/contracts.js';
import { ASSESSMENT_PROMPT, EXTRACTION_PROMPT, PROMPT_VERSION } from './agents/prompts.js';
import { callStructured, type ModelClient } from './agents/ollama.js';
import { sourceMap, validateAssessment, validateExtraction } from './agents/validation.js';
import { ModelError } from './errors.js';
import type { Store } from './storage/store.js';

export class Pipeline {
  private pending = new Set<string>();
  private active = false;
  private stopped = false;
  private waiters: (() => void)[] = [];
  constructor(
    private store: Store,
    private client: ModelClient,
    private wait?: (ms: number) => Promise<void>,
  ) {}
  get processing() {
    return this.active ? 1 : 0;
  }
  enqueue(id: string) {
    const record = this.store.get(id);
    if (!record || ['completed', 'extracting', 'assessing'].includes(record.status)) return;
    this.store.status(id, 'queued');
    this.pending.add(id);
    if (!this.active && !this.stopped) void this.drain();
  }
  async idle(): Promise<void> {
    if (this.active || this.pending.size) await new Promise<void>((r) => this.waiters.push(r));
  }
  stop() {
    this.stopped = true;
  }
  private async drain() {
    this.active = true;
    while (this.pending.size && !this.stopped) {
      const id = this.pending.values().next().value!;
      this.pending.delete(id);
      let stage: 'extraction' | 'assessment' = 'extraction';
      try {
        const record = this.store.get(id)!;
        let extraction = record.extraction;
        if (!extraction) {
          this.store.status(id, 'extracting');
          extraction = await callStructured(
            this.client,
            EXTRACTION_PROMPT,
            {
              headers: {
                sender: record.input.sender,
                recipients: record.input.recipients,
                date: record.input.date,
                subject: record.input.subject,
              },
              sources: sourceMap(record.input),
              warnings: record.input.warnings,
            },
            Extraction,
            (e) => validateExtraction(e, record.input),
            this.wait,
          );
          this.store.saveExtraction(id, extraction, this.client.model, PROMPT_VERSION);
        }
        stage = 'assessment';
        this.store.status(id, 'assessing');
        const draft = await callStructured(
          this.client,
          ASSESSMENT_PROMPT,
          extraction,
          assessmentSchema(extraction),
          (a) => validateAssessment(resolveAssessment(a, extraction!), extraction!),
          this.wait,
        );
        this.store.complete(id, resolveAssessment(draft, extraction));
      } catch (error) {
        this.store.fail(id, {
          stage,
          code: error instanceof ModelError ? error.code : 'PROCESSING_ERROR',
          message:
            error instanceof ModelError
              ? error.message
              : 'Processing failed unexpectedly. The original content has been preserved; please retry.',
        });
        if (!(error instanceof ModelError)) console.error('Pipeline failed:', id, error);
      }
    }
    this.active = false;
    this.waiters.splice(0).forEach((resolve) => resolve());
  }
}
