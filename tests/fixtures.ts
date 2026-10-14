import type { Assessment, Extraction, NormalizedEmail } from '../shared/contracts';
import type { ModelClient, ModelRequest } from '../server/agents/ollama';
export const input: NormalizedEmail = {
  sender: 'alex@example.com',
  recipients: ['finance@example.com'],
  date: '2026-06-02T08:14:00Z',
  subject: 'Payment request',
  body: 'Please send $500 to Example Ltd today.',
  attachments: [],
  warnings: [],
  source: 'paste',
};
export const evidence = { source: 'body', quote: 'Please send $500 to Example Ltd today.' };
export const extraction: Extraction = {
  sender: input.sender,
  recipients: input.recipients,
  date: input.date,
  subject: input.subject,
  summary: 'Alex requests a payment.',
  facts: [
    {
      kind: 'request',
      value: 'Send $500 to Example Ltd today.',
      attribution: 'alex@example.com',
      evidence,
    },
  ],
  links: [],
  attachmentSummaries: [],
};
extraction.facts.push({
  kind: 'other',
  value: `Envelope sender: ${input.sender}`,
  attribution: null,
  evidence: { source: 'headers', quote: `From: ${input.sender}` },
});

export const assessment: Assessment = {
  level: 'low',
  rationale: 'A payment request needs routine verification; no proof of fraud.',
  tags: ['payment-request'],
  evidence: [evidence],
  entities: [
    { id: 'e1', type: 'person', name: 'Alex', identifier: 'alex@example.com', evidence },
    { id: 'e2', type: 'organization', name: 'Example Ltd', identifier: null, evidence },
  ],
  relationships: [{ sourceId: 'e1', targetId: 'e2', type: 'requests_transfer_to', evidence }],
};
export class ScriptedModel implements ModelClient {
  model = 'test-model';
  calls: ModelRequest[] = [];
  constructor(public replies: (string | Error)[]) {}
  async health() {
    return { available: true, message: 'Test model' };
  }
  async generate(request: ModelRequest) {
    this.calls.push(request);
    const reply = this.replies.shift();
    if (reply instanceof Error) throw reply;
    if (reply === undefined) throw new Error('No scripted response');
    return reply;
  }
}
export const noWait = async () => {};

export const assessmentDraft = {
  level: assessment.level,
  rationale: assessment.rationale,
  tags: assessment.tags,
  evidenceFactIndexes: [0],
  entities: assessment.entities.map(({ evidence, ...entity }) => ({
    ...entity,
    evidenceFactIndex: 0,
  })),
  relationships: assessment.relationships.map(({ evidence, ...relationship }) => ({
    ...relationship,
    evidenceFactIndex: 0,
  })),
};
