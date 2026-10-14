import { z } from 'zod';
import { Assessment, EntityType, RiskLevel, type Extraction } from '../../shared/contracts.js';

// Reference validated facts instead of asking a small model to copy the same quotes repeatedly.
// This keeps the second call compact and makes provenance a deterministic operation.
export function assessmentSchema(extraction: Extraction) {
  const factIndex = z
    .number()
    .int()
    .min(0)
    .max(extraction.facts.length - 1)
    .describe('Zero-based index of a supporting fact in input.facts. The first fact has index 0.');
  return z.object({
    level: RiskLevel,
    rationale: z.string().min(1).max(1200),
    tags: z.array(z.string().min(1).max(50)).max(5),
    evidenceFactIndexes: z.array(factIndex).min(1).max(3),
    entities: z
      .array(
        z.object({
          id: z.string().min(1).max(60),
          type: EntityType.describe(
            'Classify a real entity. Dates, deadlines and requested actions are not entities. amount means a monetary value; account means an actual financial account.',
          ),
          name: z
            .string()
            .min(1)
            .max(200)
            .describe(
              'An entity name or monetary amount, never a date or an action such as update records.',
            ),
          identifier: z
            .string()
            .max(200)
            .nullable()
            .describe(
              'Exact explicit email address or null. Never a name or partial account number.',
            ),
          evidenceFactIndex: factIndex,
        }),
      )
      .max(10),
    relationships: z
      .array(
        z.object({
          sourceId: z.string(),
          targetId: z.string(),
          type: z
            .string()
            .min(1)
            .max(80)
            .regex(/^[a-z][a-z0-9_]*$/),
          evidenceFactIndex: factIndex,
        }),
      )
      .max(12),
  });
}
export type AssessmentDraft = z.infer<ReturnType<typeof assessmentSchema>>;
export function resolveAssessment(draft: AssessmentDraft, extraction: Extraction): Assessment {
  const evidence = (index: number) => {
    const fact = extraction.facts[index];
    if (!fact) throw new Error('Evidence references an unknown fact.');
    return fact.evidence;
  };
  const entities = new Map<string, AssessmentDraft['entities'][number]>();
  for (const candidate of draft.entities) {
    // Invalid optional merge keys must not link unrelated entities across emails.
    const identifier = candidate.identifier;
    const entity = {
      ...candidate,
      identifier:
        identifier &&
        ['person', 'organization'].includes(candidate.type) &&
        z.email().safeParse(identifier).success &&
        JSON.stringify(extraction).includes(identifier)
          ? identifier
          : null,
    };
    const existing = entities.get(entity.id);
    if (
      existing &&
      (existing.type !== entity.type ||
        existing.name !== entity.name ||
        existing.identifier !== entity.identifier)
    ) {
      throw new Error('The same entity ID refers to different entities. Use unique IDs.');
    }
    // Repeated mentions of the exact same entity are safe to collapse. Ambiguous IDs still fail.
    if (!existing) entities.set(entity.id, entity);
  }
  return Assessment.parse({
    level: draft.level,
    rationale: draft.rationale,
    tags: [...new Set(draft.tags)],
    evidence: [...new Set(draft.evidenceFactIndexes)].map(evidence),
    entities: [...entities.values()].map(({ evidenceFactIndex, ...entity }) => ({
      ...entity,
      evidence: evidence(evidenceFactIndex),
    })),
    relationships: draft.relationships.map(({ evidenceFactIndex, ...relationship }) => ({
      ...relationship,
      evidence: evidence(evidenceFactIndex),
    })),
  });
}
