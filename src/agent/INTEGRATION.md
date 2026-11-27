# Brains and report integration

## Current state

Working checkout: `/home/alexhuang/Documents/ChatGPT/yc-elevnlabs/yc-elevenlabs-hackathon`, branch `track-3-4-agent-report`. Track 1 main was synchronized through `6158bbc` (Postgres data layer, source storage, jobs, audio route and study pages). The old description of an empty schema/browser-only backend is obsolete.

Our integration replaces the template-question and `First impressions` synthesis placeholders. The integration lives on `track-3-4-agent-report`. Preserve any local changes when pulling. The autostash created during the Track 1 merge is a backup; its main.wasp.ts conflict was resolved by retaining both tracks' registrations.

## What calls what

- `createStudy` imports product knowledge, calls `agent/suggestQuestions.ts` and saves 3–5 model-generated questions with the study.
- `generateStudyQuestions` reads the study's saved knowledge plus the founder's current goal/audience. The questionnaire's Generate new questions button returns an editable draft; Save changes persists it. Failed generation preserves existing questions.
- `getPublicStudy` returns saved question strings plus `dynamicVariables` containing `product_url`, `goal`, numbered `questions`, `product_context`, `audience`, and `study_id`. Follow-up flags are included in the numbered question instructions.
- Track 2 should pass `study.dynamicVariables` to ElevenLabs `startSession`, capture the conversation ID, and call `finishInterview({studyId, conversationId, questionSnapshot: study.questions})`. Capture the question list at **call start**. Older clients can omit it; their fallback snapshot is taken when finishInterview runs, not at call start.
- `finishInterview` upserts the conversation and enqueues `processInterview`, keyed by interview so repeated submissions neither duplicate interviews nor jobs. A conversation cannot be reassigned to a different study.
- `processInterview` polls ElevenLabs for the full transcript, saves it and its duration, marks the interview done, and queues `rebuildStudyReport`. Retried jobs reuse stored transcripts. A model failure does not discard the completed call.
- `rebuildStudyReport` is keyed by study, so interviews ending together share one rebuild, and rebuilds for one study never run in parallel. Calls whose transcript can't be parsed are skipped and logged.
- `report/server.ts` loads all stored transcripts. Legacy completed calls without a stored transcript are fetched from ElevenLabs first. `agent/synthesizeStudy.ts` synthesizes all completed calls with product context, audience, goal and question snapshots.
- The report contains an executive summary, shared themes, distinct supporting-call counts, exact quotes, recommended experiments, and answered/partial/unanswered findings for each final research question.
- `getReport` returns the saved report plus live processing/failure counts. The real route is `/study/:studyId/report`, polling every five seconds. Update report rebuilds from stored calls when the founder requests it. Study and source edits don't rebuild on their own; the report shows it is out of date until Update report runs. No manual transcript import appears in the founder workflow.

The phone/character page is still Track 2/4 work. There is no `/i/:studyId` implementation in this pull yet. An actual voice call remains the final end-to-end check when that page lands.

## Persistence and retries

Append-only schema additions:

- `Study.report` JSON cache, `reportRevision` integer, `reportError` text.
- `Interview.transcript` JSON full conversation and `questionSnapshot` JSON.
- Migration: `migrations/20261122180000_report_synthesis/migration.sql`.

Apply migrations before running the new code. Saving calls or changing research context increments the study revision. Report generation happens outside a DB transaction; the final transaction checks the revision, replaces themes/quotes and saves the report together. A stale result reloads/retries rather than overwriting newer evidence. Counts are rebuilt, not incremented on job retries. A successful cached revision is reused by duplicate jobs. Last-good reports remain visible after model errors.

PgBoss retries failures up to three times with backoff. Report regeneration is also available in the UI. API actions use the same access model as the pulled hackathon app; authentication is not implemented by this integration.

## Credentials and model

All three generation paths use the shared server-only OpenRouter adapter in `agent/llm.ts`. `.env.server` contains the user's supplied key locally and is ignored by Git. Do not print or copy it into source, documentation, screenshots, or browser code.

```dotenv
OPENROUTER_API_KEY=your-key
OPENROUTER_MODEL=openrouter/free
```

Restart the server after editing environment settings. `openrouter/free` routes to compatible free models, so availability and output quality vary. Pin a specific OpenRouter model ID with `OPENROUTER_MODEL` when desired. Requests require JSON-output support and have a 90-second deadline. Provider errors are sanitized. No automatic paid-model fallback is configured.

The report currently accepts all calls up to a combined 100,000 transcript characters in one synthesis, plus up to 120,000 context characters and 50 questions. It does not silently choose only the latest calls. Larger studies fail explicitly; multi-pass large-study summarization is not implemented.

## Evidence rules

Only participant turns are evidence. Model output chooses turn IDs, then server code copies original text and timestamps. Quote starts come from ElevenLabs `timeInCallSecs`; ends come from the next turn or recording duration. Recommendations and answered/partial research findings must cite real output themes. These validation checks establish traceability, not guaranteed semantic correctness.

Recordings use Track 1's server audio proxy. Stored report audio URLs are reconstructed from the current server URL when read, so changing an HTTPS tunnel does not strand old quotes.

## Checks

Focused tests:

```sh
node_modules/.bin/vitest run --config src/agent/vitest.config.ts
```

Additional regression coverage checks revision races, report failures preserving old data, more than ten calls, exact quote timing, question snapshots, and provider errors. See the current task's final status for full-Wasp and live-model validation results.

## Verified checkpoint

- 61 focused tests pass, and full `wasp compile` succeeds with Wasp 0.26.1 / Node 24.22.1.
- All three migrations applied successfully to an isolated local Postgres database (`mira-report-dev`, host port 55439).
- Live OpenRouter tests passed for both 3–5 question generation and report synthesis.
- Real Wasp API integration passed: create study with four generated questions and a saved source; save a founder edit/follow-up flag; read correct ElevenLabs dynamic variables; save two synthetic full transcripts; regenerate/persist the report; read it back with exact quote text/timing and recording routes.
- The report page picked up the saved synthesis through its five-second polling without a manual reload.
- Synthetic demonstration study: `cmws4tk5e0000tplek64byws2`, at `http://localhost:3002/study/cmws4tk5e0000tplek64byws2/report`. These are not real customer calls. The two unique quotes appear in multiple themes.
- Actual ElevenLabs calling/audio has not been tested. `ELEVENLABS_API_KEY` is now configured locally, but Track 2's phone route is not in this pull.

The full Wasp app is running on client 3002/server 3003. Local tools were installed only inside ignored `.workspace/tooling`; `.workspace/wasp` selects the matching Node/CLI. Restart from the repo with:

```sh
docker start mira-report-dev
.workspace/wasp start --client-port 3002 --server-port 3003
```

On a teammate's normal Wasp setup, apply `wasp db migrate-dev`, set their server environment variables, then use `npm run dev`. Package manifests and lockfile are unchanged by our integration.
