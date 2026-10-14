import { z } from 'zod';

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_TEXT_CHARS = 12_000;
export const MAX_ATTACHMENTS = 10;
export const RiskLevel = z.enum(['none', 'low', 'medium', 'high']);
export type RiskLevel = z.infer<typeof RiskLevel>;
export const ProcessingStatus = z.enum([
  'queued',
  'extracting',
  'assessing',
  'completed',
  'failed',
]);
export type ProcessingStatus = z.infer<typeof ProcessingStatus>;
export const Evidence = z.object({
  source: z.string().min(1).max(250).describe('body, headers, or exact attachment filename'),
  quote: z.string().min(1).max(500).describe('An exact verbatim substring of the named source'),
});
export type Evidence = z.infer<typeof Evidence>;
export const Attachment = z.object({
  filename: z.string().min(1).max(250),
  text: z.string(),
  warning: z.string().nullable(),
});
export const NormalizedEmail = z.object({
  sender: z.string().max(320).nullable(),
  recipients: z.array(z.string().max(320)).max(100),
  date: z.string().max(100).nullable(),
  subject: z.string().max(1000).nullable(),
  body: z.string(),
  attachments: z.array(Attachment).max(MAX_ATTACHMENTS),
  warnings: z.array(z.string()),
  source: z.enum(['seed', 'paste', 'txt', 'pdf', 'eml']),
});
export type NormalizedEmail = z.infer<typeof NormalizedEmail>;
export const Fact = z.object({
  kind: z.enum(['amount', 'date', 'account', 'reference', 'request', 'claim', 'other']),
  value: z.string().min(1).max(500),
  attribution: z
    .string()
    .nullable()
    .describe(
      'Who makes the claim; null when not applicable. Never convert allegations to established facts.',
    ),
  evidence: Evidence,
});
export const Extraction = z.object({
  sender: z.string().max(320).nullable(),
  recipients: z.array(z.string().max(320)).max(100),
  date: z.string().max(100).nullable(),
  subject: z.string().max(1000).nullable(),
  summary: z.string().min(1).max(1600),
  facts: z.array(Fact).max(24),
  links: z.array(z.string().max(500)).max(20),
  attachmentSummaries: z
    .array(z.object({ filename: z.string(), summary: z.string().max(800) }))
    .max(MAX_ATTACHMENTS),
});
export type Extraction = z.infer<typeof Extraction>;
export const EntityType = z.enum(['person', 'organization', 'amount', 'account', 'location']);
export type EntityType = z.infer<typeof EntityType>;
export const Entity = z.object({
  id: z.string().min(1).max(60).describe('Unique local ID, e.g. e1'),
  type: EntityType,
  name: z.string().min(1).max(200),
  identifier: z
    .string()
    .max(200)
    .nullable()
    .describe(
      'Exact email address or FULL account identifier only when explicitly present. Otherwise null. Never use partial account numbers as identifiers.',
    ),
  evidence: Evidence,
});
export const Relationship = z.object({
  sourceId: z.string(),
  targetId: z.string(),
  type: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z][a-z0-9_]*$/)
    .describe('snake_case predicate, e.g. requests_transfer_to'),
  evidence: Evidence,
});
export const Assessment = z.object({
  level: RiskLevel,
  rationale: z.string().min(1).max(2000),
  tags: z.array(z.string().min(1).max(50)).max(8),
  evidence: z.array(Evidence).min(1).max(6),
  entities: z.array(Entity).max(18),
  relationships: z.array(Relationship).max(24),
});
export type Assessment = z.infer<typeof Assessment>;
export type Stage = 'extraction' | 'assessment';
export interface ProcessingError {
  stage: Stage;
  code: string;
  message: string;
}
export interface EmailRecord {
  id: string;
  input: NormalizedEmail;
  status: ProcessingStatus;
  extraction: Extraction | null;
  assessment: Assessment | null;
  error: ProcessingError | null;
  createdAt: string;
  updatedAt: string;
  model: string | null;
  promptVersion: string | null;
}
export interface EmailSummary {
  id: string;
  sender: string | null;
  subject: string | null;
  date: string | null;
  preview: string;
  status: ProcessingStatus;
  risk: RiskLevel | null;
  attachmentCount: number;
  partial: boolean;
  tags: string[];
}
export interface GraphNode {
  id: string;
  type: EntityType;
  name: string;
  emailIds: string[];
}
export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  emailId: string;
  evidence: Evidence;
}
export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
export interface Health {
  model: string;
  available: boolean;
  message: string;
  processing: number;
  queued: number;
  autoProcess: boolean;
}
