# Evaluation notes

The supplied dataset has no ground-truth risk labels. The following is a **human-readable review rubric**, not a claim of calibrated classification accuracy or an exact expected score. No seed ID, sender, phrase, or expected label is hardcoded into the production classifier.

| Sample | Signal a reviewer should inspect                                                                    |
| ------ | --------------------------------------------------------------------------------------------------- |
| E001   | Urgent confidential transfer, claimed executive identity and unusual sender domain                  |
| E002   | Routine maintenance notice; avoid false alarms                                                      |
| E003   | Internal documents sent to a personal address before resignation, with secrecy/context of grievance |
| E004   | Changed payment destination and a larger amount than the previous invoices quoted in its attachment |
| E005   | Suggested share purchase ahead of an unannounced deal and deletion request                          |
| E006   | Threatening language tied to a contract dispute                                                     |
| E007   | Routine holiday announcement; avoid false alarms                                                    |
| E008   | Lookalike domain, password-reset request and urgency                                                |
| E009   | Ordinary invoice; no anomaly evident in this message alone                                          |
| E010   | Anonymous allegation of questionable accounting; preserve attribution and uncertainty               |

## What the tests establish

Deterministic tests verify contracts, provenance, recovery and application behavior. They do not test whether a model has understood every allegation or produced a fair, calibrated risk level. The real-model smoke command verifies that the actual two-stage pipeline can complete on all samples; manual review checks the content of those results against the rubric above.

## Initial model findings

`qwen3:4b` with thinking disabled produced syntactically valid but materially poor judgments on several samples, including missed insider-risk/trading/phishing signals. In one extraction it emphasized attachment amounts while dropping the body narrative. Those results were rejected as an adequate final demonstration. The source-coverage validator and instruction-oriented model evaluation were added in response. See `PROCESS.md` for the development record.

## Remaining limitations

A verbatim quote can be real yet fail to support the inference made from it. Validating a fact reference guarantees its existence, not semantic entailment. Small local models can still omit context, overstate identities, choose debatable tags or disagree with human priorities. Results must be reviewed alongside the original message. No percentage accuracy is reported for ten unlabelled examples.

## Final observed local run — 2026-10-01

All ten supplied messages completed both stages using `qwen3:4b-instruct`. Failed-stage retries reused the saved extraction, exercising recovery rather than recomputing A. These are observed model judgments, not ground-truth labels or an accuracy score.

| Sample | Observed risk |
| ------ | ------------- |
| E001   | medium        |
| E002   | none          |
| E003   | medium        |
| E004   | medium        |
| E005   | high          |
| E006   | medium        |
| E007   | none          |
| E008   | high          |
| E009   | none          |
| E010   | medium        |

Qualitative limitations observed: some unrelated risk tags, inappropriate entity types for dates/documents, and overconfident identity wording. Evidence grounding prevents fabricated quotes but does not guarantee correct inference or entity classification.
