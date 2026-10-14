# Assignment requirements audit

Reviewed on 2026-10-14 against the included [original assignment](candidate_task_brief.md).

| Requirement                                   | Implementation / verification                                                                |
| --------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Seed mailbox and new items                    | Ten provided seed emails; paste and TXT/PDF/EML ingestion; ingestion/API tests               |
| Same processing path for new and seeded items | NormalizedEmail contract and shared Pipeline                                                 |
| Agent A structured extraction                 | Extraction schema, source-grounded facts, metadata and attachment summaries                  |
| Agent B consumes A                            | Pipeline passes only validated extraction; explicit pipeline regression test                 |
| Risk, tags, entities and relationships        | Assessment schema, evidence resolution and endpoint validation                               |
| Free/local LLM for both agents                | Two real Ollama calls; configurable local qwen3:4b-instruct; no paid key                     |
| Model failure handling                        | Timeouts, bounded transient retries, one output repair, partial-stage retry                  |
| Persistence                                   | SQLite emails/entities/mentions/relationships; reopen and rollback tests                     |
| Required UI                                   | Inbox metadata/risk, original decoded content, extraction, rationale, entities/relationships |
| Narrow viewport                               | Mobile navigation and overflow checks in Playwright                                          |
| Interactive aggregate graph (bonus)           | React Flow pan/zoom, selection, connections and source navigation                            |
| React + TypeScript / allowed backend          | React/TypeScript and Express/TypeScript                                                      |
| Styling rationale                             | Plain CSS tradeoff documented in README                                                      |
| Configuration and offline behavior            | .env.example; explicit errors and preserved data, no synthetic fallback                      |
| Architecture separation                       | ingestion, agents, pipeline, storage, API and client modules                                 |
| Tests                                         | 35 unit/integration tests and 10 browser tests; typecheck/build                              |
| README                                        | Setup, architecture, tradeoffs, limitations and future work                                  |
| AI workflow                                   | PROCESS describes candidate decisions, autonomous coding, validation and corrections         |
| Delivery                                      | Source ZIP with lockfile, seed data, configuration example, docs and tests                   |
| Optional video                                | Not included; not required                                                                   |

## Verification scope

On 2026-10-14, `npm run check` and `npm run test:e2e` passed again. The real-model ten-message run completed on 2026-10-01; this audit does not claim a new full model run or calibrated model accuracy. Known semantic errors and ingestion boundaries remain documented in README and EVALUATION. Original content means stored decoded text/envelope fields, not a binary MIME archive. Scanned PDFs require OCR outside this version's scope.

All required application capabilities are implemented. Independent candidate review is useful preparation but is not an additional deliverable required by the assignment.

## Submission file coverage

- `docs/candidate_task_brief.md`: unchanged assignment supplied by the recruiter, included for reference.
- `data/mock_mailbox_data.json`: all ten messages, verified equal to the supplied JSON.
- `README.md`: install/run instructions, Node/Ollama prerequisites, local model choice, offline behavior, architecture, CSS rationale, assumptions, limits and future improvements.
- `PROCESS.md`: planning approach, candidate decisions, autonomous implementation, user-reported defects and corrections, task decomposition, verification. No coding subagents were used.
- `.env.example`: configuration without credentials.
- `package.json`, `package-lock.json` and build/test configuration: reproducible dependency versions and commands.
- `client/`, `server/`, `shared/`, `public/` and `index.html`: application source and assets.
- `tests/`: unit, integration and browser regression tests, including scrolling, filter popup and line-wrapped evidence.
- `docs/EVALUATION.md`: model observations and semantic limitations; screenshots are included separately.
- `examples/payment-change.eml`: optional synthetic upload sample with a TXT attachment.

The personal Hebrew study guide is not a required submission artifact and is not bundled. Downloaded model weights, local runtime, dependencies, live mailbox database, environment secrets and debugging output are intentionally excluded; installation is documented in README. The ZIP is a source-code delivery, not a hosted deployment. A walkthrough video and GitHub hosting are optional when submitting a ZIP.

Latest regression evidence: 35 unit/integration tests and ten browser tests passed after the whitespace fix, along with type checking and the production build. The same newly pasted maintenance message completed real-model processing after that fix. Archive contents were checked against the current source files and ZIP integrity was verified.
