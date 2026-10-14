import { type Assessment, type Extraction, type NormalizedEmail } from '../../shared/contracts.js';

export function sourceMap(input: NormalizedEmail): Record<string, string> {
  return {
    headers: [
      input.sender && `From: ${input.sender}`,
      input.recipients.length && `To: ${input.recipients.join(', ')}`,
      input.date && `Date: ${input.date}`,
      input.subject && `Subject: ${input.subject}`,
    ]
      .filter(Boolean)
      .join('\n'),
    body: input.body,
    ...Object.fromEntries(input.attachments.filter((a) => a.text).map((a) => [a.filename, a.text])),
  };
}
export function validateExtraction(value: Extraction, input: NormalizedEmail): void {
  const sources = sourceMap(input);
  for (const fact of value.facts) {
    if (!sources[fact.evidence.source]?.includes(fact.evidence.quote)) {
      // A quote in exactly one source can be grounded deterministically, even if the model mislabeled the source.
      const matches = Object.entries(sources).filter(([, text]) =>
        text.includes(fact.evidence.quote),
      );
      if (matches.length === 1) fact.evidence.source = matches[0][0];
      else {
        // Models often flatten line wrapping. Restore the exact original substring only
        // when whitespace is the sole difference and there is one unambiguous match.
        const pattern = fact.evidence.quote
          .trim()
          .split(/\s+/)
          .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          .join('\\s+');
        const candidates: { source: string; quote: string }[] = [];
        for (const [source, text] of Object.entries(sources)) {
          for (const match of text.matchAll(new RegExp(pattern, 'g'))) {
            candidates.push({ source, quote: match[0] });
            if (candidates.length > 1) break;
          }
          if (candidates.length > 1) break;
        }
        if (pattern && candidates.length === 1 && candidates[0].quote.length <= 500) {
          fact.evidence = candidates[0];
        } else {
          throw new Error(
            `Evidence quote does not occur verbatim in source "${fact.evidence.source}". Use exact source names and verbatim substrings.`,
          );
        }
      }
    }
  }
  if (!value.facts.length) throw new Error('At least one evidence-backed fact is required.');
  for (const [source, text] of Object.entries(sources)) {
    if (
      source !== 'headers' &&
      text.trim() &&
      !value.facts.some((f) => f.evidence.source === source)
    ) {
      throw new Error(
        `Missing facts from source "${source}". Include the main requests, actions, and claims from every readable source, especially the email body.`,
      );
    }
  }
  // Keep sender identity available to B even when the model focused on the document body.
  if (
    input.sender &&
    !value.facts.some(
      (f) => f.evidence.source === 'headers' && f.evidence.quote.includes(input.sender!),
    )
  ) {
    if (value.facts.length >= 24) throw new Error('Leave room for one sender-header fact.');
    value.facts.push({
      kind: 'other',
      value: `Envelope sender: ${input.sender}`,
      attribution: null,
      evidence: { source: 'headers', quote: `From: ${input.sender}` },
    });
  }

  for (const attachment of value.attachmentSummaries) {
    if (!input.attachments.some((a) => a.filename === attachment.filename && a.text))
      throw new Error('Attachment summary references an unavailable source.');
  }
  // Deterministic envelope metadata takes precedence over a model's interpretation.
  if (input.sender) value.sender = input.sender;
  if (input.recipients.length) value.recipients = input.recipients;
  if (input.date) value.date = input.date;
  if (input.subject) value.subject = input.subject;
}
export function validateAssessment(value: Assessment, extraction: Extraction): void {
  const ids = new Set(value.entities.map((e) => e.id));
  if (ids.size !== value.entities.length) throw new Error('Entity IDs must be unique.');
  const allowedEvidence = new Set(extraction.facts.map((f) => JSON.stringify(f.evidence)));
  for (const evidence of [
    ...value.evidence,
    ...value.entities.map((e) => e.evidence),
    ...value.relationships.map((e) => e.evidence),
  ]) {
    if (!allowedEvidence.has(JSON.stringify(evidence)))
      throw new Error('Evidence must exactly copy a source/quote pair from extraction facts.');
  }
  for (const edge of value.relationships) {
    if (!ids.has(edge.sourceId) || !ids.has(edge.targetId))
      throw new Error(
        `Relationship references an unknown entity: ${JSON.stringify(edge)}. ` +
          `Every sourceId and targetId must exactly match one of these existing entity IDs: ${JSON.stringify([...ids])}. ` +
          'Remove relationships whose endpoints are not in entities. Do not invent document entities.',
      );
  }
  for (const entity of value.entities) {
    if (entity.identifier && !['person', 'organization'].includes(entity.type))
      throw new Error('Only people and organizations can have email identifiers.');
    if (entity.identifier && !JSON.stringify(extraction).includes(entity.identifier))
      throw new Error('Entity identifier is absent from extraction.');
  }
}
