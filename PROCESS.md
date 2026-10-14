# AI-assisted development process

## Context and scope

The coding assistant inspected the assignment and all ten seed emails; the candidate discussed scope and planning decisions. The candidate requested an explanation of ambiguities and recommended decisions, then explicitly approved a phased implementation plan. Work was moved to `~/Developer/stargo-mail-risk-intelligence` at the candidate's request to keep source, dependencies and local model files outside iCloud-managed Documents/Desktop.

## Approved decisions

React/TypeScript, Express/TypeScript, SQLite; two sequential LLM calls with schema validation; partial results retained; transient retries and bounded repair; no synthetic risk fallback; text PDFs only; explicit partial-coverage warnings; source-linked facts and relationships; conservative entity merging; per-email risk assessment. Aggregate graph is a bonus after the core works.

## Prompting and decomposition

The human asked (in Hebrew) to understand the assignment, then asked for a recommendation on each ambiguity, approved the recommendations and requested a work plan before approving execution. Development is split into contracts/storage, one end-to-end pipeline, ingestion/recovery, UI, verification and documentation. No coding subagents have been used.

The in-product Extraction Agent and Risk & Graph Agent are separate from this coding assistant. Their actual system prompts are versioned in `server/agents/prompts.ts`. Untrusted email content is passed as data; these agents have no tools. Agent B receives only Agent A's validated structured output.

## Autonomous work and interventions

- Human: established the scope and review-before-build workflow; approved error-handling choices; selected a non-iCloud project location.
- Coding assistant: chooses implementation details within that plan, writes and runs tests, checks the actual local model and browser, and records defects and corrections below.
- Credentials, publication and sending the assignment to the recruiter are not part of this work.

## Work log

- 2026-09-27: verified Node 24.12, Apple Silicon and 16 GB RAM. Ollama was not preinstalled. Selected project-local runtime/model storage for verification. Official Ollama structured-output and chat API documentation was consulted.

## Corrections discovered through verification

1. **Model source labels:** the first real-model attempt copied valid body quotes but labeled them as headers. Schema validation alone would not catch this. Added deterministic grounding: accept a corrected source label only if the exact quote occurs in exactly one original source; otherwise fail and request repair. Added a regression test.
2. **Agent B quote copying:** repeated quote strings made B's response verbose and caused invalid source/quote pairs even after repair. Replaced model-generated B evidence strings with bounded, zero-based references to A's facts. The server resolves references to the original evidence; the public API still contains readable quotes. This reduced output size and moved provenance handling out of the model.
3. **Prompt grounding:** supplied the JSON schema in the system prompt as well as the constrained-output parameter, so the model sees field descriptions. Clarified that risk tags must be specific to actual content, not a list of possible risk categories, and claimed identities are not verified identities.
4. **Browser verification:** the first axe pass found low-contrast muted text and an invalid ARIA label on a generic div. Adjusted text colors, gave the progress graphic a valid role, and rechecked desktop and mobile. A keyboard test exposed focus not returning after the modal closed; explicit restoration fixed it. A further pass covered completed review, entities, graph and upload dialog.
5. **Build verification:** removed an unnecessary empty CSS import that Vite could not resolve. Type checking caught an overly narrow UUID default parameter type; explicitly typed the repository ID as a string to support seed IDs.
6. **Fresh model run:** backed up the initial development-only SQLite results in ignored `work/`, verified it contained only the provided seed data, and reset derived results to rerun all ten inputs after prompt/contract changes. Source messages were preserved.

## Verification and responsibilities

The candidate requested and approved the scope and implementation plan, requested an architecture/code walkthrough, and requested a final assignment-compliance audit. The coding assistant implemented the application, inspected model outputs, corrected defects, and executed the automated and browser checks described below. No coding subagents were used.

The implementation was checked through source inspection, unit/integration tests, browser tests, and a real-model seed run. On October 14, all 33 unit/integration tests and eight browser tests passed again, together with type checking and the production build. The source ZIP was checked for the required files and archive integrity. These are concrete verification results; they do not imply that the candidate independently performed a line-by-line review or that model judgments are always accurate.

## Model-quality review (not just schema checks)

A complete structured response is not necessarily a correct assessment. The initial `qwen3:4b` run with thinking disabled missed clear warning signs: it treated the departing employee's forwarding of internal contracts as routine and also under-classified trading and phishing examples. These were observed failures, not acceptable “passing” results. This motivated evaluating `qwen3:4b-instruct`, which is designed for direct instruction following, instead of hiding failures with hardcoded seed-specific labels. A source-coverage check now rejects A output that entirely omits the email body or a readable attachment. Exact risk levels remain judgment calls; semantic quality is reviewed separately from deterministic schema/provenance tests.

The graph's first visual inspection also showed overlapping labels for multiple relationships between the same nodes. The final view groups these into one visual edge and preserves all individual evidence in the inspector. Selecting an entity centers and zooms to it; reduced-motion preferences are respected.

## Resumed verification — 2026-09-30

The candidate asked how to continue. The project files and downloaded instruction model were intact, but the app server was stopped. Re-ran the deterministic suite (31 tests), production build, and eight browser tests successfully. The instruction variant preserved the previously missing resignation/secrecy context. Its first assessment still underweighted the insider-risk example because it treated lack of proven harm as reassurance. Clarified the general risk rubric: potential exposure and review urgency are distinct from a verdict, with concrete indicator categories and counterexamples for routine correspondence. The revised rationale recognized copying confidential contracts, resignation and concealment. Selected `qwen3:4b-instruct` as the default and started a fresh ten-message run, retaining the earlier database as an ignored development backup.

## Final verification — 2026-10-01

Repeated identical entity IDs are deduplicated, while conflicting definitions remain errors. Optional cross-message merge identifiers are accepted only for people/organizations when they are valid email addresses present in extraction; unsafe optional keys become null, retaining a message-local entity. A regression test verifies valid and invalid cases. Dangling relationships remain rejected, with concrete endpoint IDs supplied in the single repair request. No seed-specific classifier overrides or synthetic risk results were introduced.

The final deterministic suite contains 33 passing unit/integration tests and eight passing browser tests. Type checking and the production build pass. Manual production-browser checks cover completed review, graph and mobile; axe reports no WCAG A/AA violations in those checked views, and no JavaScript errors or horizontal overflow were observed. A marginal mobile back-button contrast issue found in that pass was corrected. Screenshots are in `docs/screenshots/`. This is sampled accessibility verification, not full certification.

The local model still makes semantic mistakes: some tags are unrelated to the rationale, dates/documents can be assigned inappropriate entity types, and a claimed sender identity can be overstated. These limitations are visible in the retained results and documented rather than masked. The project is a review assistant prototype, with human judgment still required.

The final retained local seed run completed all 10/10 messages, including the routine holiday and baseline invoice examples at `none`. See `docs/EVALUATION.md` for observed levels and qualitative limitations.

## Submission audit — 2026-10-14

Re-read the assignment against the implementation and delivery contents. Re-ran the 33 unit/integration tests, type checking, production build and eight browser tests. Updated the verification-provenance wording to describe actual responsibilities rather than retain a stale pre-handoff status sentence. See `docs/REQUIREMENTS.md` for the requirement mapping. The AI-assisted workflow and model limitations remain disclosed.

## Localhost portability update

Standardized application, model, test and documented addresses on `localhost`. Browser API requests remain relative to the serving origin. Vite now reads the backend `PORT` from the environment or `.env`, so changing it does not require editing the proxy configuration. All 33 unit/integration tests, eight browser tests, type checking and the production build passed after the change; a custom-port configuration check also passed.

## Inbox scrolling correction

A user screenshot exposed clipped inbox rows on desktop. Reproduced with a browser regression test: the list expanded to its content height instead of becoming scrollable. Added `min-height: 0` to the grid's inbox panel and its flex list, with vertical overflow and a stable scrollbar gutter. The regression now scrolls to and opens the last message at widths 1440, 1024 and 390. All nine browser tests and the typecheck/production build passed after this change. This adds explicit scroll reachability coverage beyond the earlier navigation tests.

## Filter popup correction

Replaced the native select popup with an accessible top-layer popover positioned beside its trigger and constrained to the viewport. This avoids browser-native popup placement problems in device emulation and clipping by the inbox container. Tests cover 1440, 440 and 390 pixel widths, popup placement, selecting/resetting filters, keyboard opening/Escape, focus restoration, outside-click dismissal and axe checks with the popup open. All ten browser tests and the typecheck/production build passed. Desktop and mobile screenshots were visually inspected.

## Line-wrapped pasted-email correction

A user-pasted maintenance notice was persisted successfully but failed extraction validation. Capturing the local model response showed that it flattened a newline into a space inside an otherwise exact quote. Added bounded whitespace-only matching: accept only one unambiguous occurrence across the supplied sources, restore the original substring including its whitespace, and retain the quote length limit. Changed wording/punctuation and ambiguous matches remain errors. Regression tests cover CRLF/spacing restoration, changed amounts and duplicate-source ambiguity.

After the fix, the same saved maintenance message completed both real-model stages with risk `none`; its evidence retains the original line break. All 35 unit/integration tests, ten browser tests, type checking and the production build passed.

## Representative candidate prompts and interventions

The following are English paraphrases of the candidate's Hebrew requests, not verbatim quotes:

- Explain the assignment and recommend decisions for the ambiguous requirements before building.
- Adopt the recommendations, prepare a work plan for approval, then implement the approved plan.
- Keep the project outside iCloud-managed directories.
- Explain how the requirements map to architecture and code, and audit the submission against the brief.
- Investigate the inbox showing only a few messages without scrolling, the misplaced filter popup, and a pasted message failing extraction.

The assistant broke implementation into contracts/storage, ingestion, sequential agent orchestration, UI/graph, and verification/documentation. User reports prompted concrete regression coverage and corrections; AI-generated code was not treated as sufficient evidence that the user-facing flows worked. Detailed outcomes are recorded in the corresponding sections above.
