# Brains and report integration

How question generation, interview processing, and report synthesis fit together.

## What calls what

- `createStudy` in `src/study/operations.ts` imports product knowledge, calls `src/agent/suggestQuestions.ts` and saves 3 to 5 model-generated questions with the study.
- `generateStudyQuestions` reads the study's saved knowledge plus the founder's current goal and audience. The questionnaire's generate button returns an editable draft; saving persists it. Failed generation keeps the existing questions.
- `getPublicStudy` returns saved question strings plus `dynamicVariables` containing `product_url`, `goal`, numbered `questions`, `product_context`, `audience`, and `study_id`. Follow-up flags are included in the numbered question instructions.
- The interview page at `/i/:studyId` (`src/interview/InterviewPage.tsx`) passes those variables to ElevenLabs `startSession`, captures the question list at call start, and on hangup calls `finishInterview({ studyId, conversationId, questionSnapshot })` through `src/interview/finished.ts`. A client that omits the snapshot gets one taken when `finishInterview` runs.
- `finishInterview` upserts the interview by conversation ID and enqueues `processInterview`, keyed by interview so repeated submissions create neither duplicate interviews nor duplicate jobs. A conversation cannot be reassigned to a different study.
- `processInterview` in `src/jobs/processInterview.ts` polls ElevenLabs for the full transcript, saves it and its duration, marks the interview done, and queues `rebuildStudyReport`. Retried jobs reuse stored transcripts. A model failure does not discard the completed call.
- `rebuildStudyReport` is keyed by study, so interviews ending together share one rebuild, and rebuilds for one study never run in parallel. Calls whose transcript can't be parsed are skipped and logged.
- `src/report/server.ts` loads all stored transcripts, fetching legacy completed calls without one from ElevenLabs first. `src/report/pipeline.ts` hands them to `src/agent/synthesizeStudy.ts`, which synthesizes all completed calls with product context, audience, goal and question snapshots.
- The report contains an executive summary, shared themes, distinct supporting-call counts, exact quotes, recommended experiments, and answered, partial or unanswered findings for each research question.
- `getReport` returns the saved report plus live processing and failure counts. The report page at `/study/:studyId/report` polls every five seconds. `regenerateStudyReport` rebuilds from stored calls when the founder asks for an update. Study and source edits don't rebuild on their own; the report shows it is out of date until the founder updates it.

## Persistence and retries

Schema fields this flow relies on, in `schema.prisma`:

- `Study.report` JSON cache, `reportRevision` integer, `reportError` text.
- `Interview.transcript` JSON full conversation and `questionSnapshot` JSON.
- Migration: `migrations/20261122180000_report_synthesis/migration.sql`, one of four in `migrations/`.

Apply migrations before running the code. Saving calls or changing research context increments the study revision. Report generation happens outside a DB transaction; the final transaction checks the revision, replaces themes and quotes, and saves the report together. A stale result reloads and retries rather than overwriting newer evidence. Counts are rebuilt, not incremented, on job retries, and duplicate jobs reuse a successful cached revision. The last good report stays visible after model errors.

PgBoss retries `processInterview` up to three times with backoff (see `main.wasp.ts`). Authentication is not implemented.

## Credentials and model

All generation paths use the server-only OpenRouter adapter in `src/agent/llm.ts`. Copy `.env.server.example` to `.env.server` and set `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` and `OPENROUTER_REASONING`; the example names the recommended model. Never copy the key into source, docs, screenshots, or browser code.

Requests require JSON output support and have a 90-second deadline. Provider errors are sanitized so response bodies never reach the client. There is no automatic fallback to another model.

One synthesis accepts up to 100,000 combined transcript characters, 120,000 context characters, and 50 questions. It does not silently drop older calls; larger studies fail explicitly.

## Evidence rules

Only participant turns are evidence. Model output chooses turn IDs, then server code copies the original text and timestamps. Quote starts come from ElevenLabs `time_in_call_secs`; ends come from the next turn or the recording duration. Citation slips are repaired rather than failing the report: citations to unknown or non-participant turns are dropped, a theme left with no quotes is dropped, a recommendation that cites no surviving theme is dropped, and a question finding's status follows whether it cites a surviving theme. These checks establish traceability, not guaranteed semantic correctness.

Recordings stream through the server audio proxy at `/api/interviews/:interviewId/audio` (`src/jobs/interviewAudio.ts`). Report audio URLs are rebuilt from the current server URL when read, so changing an HTTPS tunnel does not strand old quotes.

## Checks

```sh
npm test
```

Coverage includes revision races, report failures preserving old data, more than ten calls, exact quote timing, question snapshots, and provider errors.
