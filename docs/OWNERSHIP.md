# Ownership

Tracks: 1 Ricky, 2 TBD, 3 TBD, 4 skeleton author. Request changes to an owned file through its owner.

| File or directory | Owner |
| --- | --- |
| `main.wasp.ts` | Track 1; others ask, append at the end |
| `schema.prisma` | Track 1, append-only |
| `package.json` + `package-lock.json` | Track 1 installs all dependencies; regenerate, never merge |
| `.gitignore`, `.env.example` | Track 1 |
| `src/contract.ts` | Track 3 drafts; changes announced to all |
| `src/Layout.tsx`, `src/Main.css`, `src/store.ts`, `src/sources.ts` | Track 1 |
| `src/study/` (knowledge and questionnaire pages) | Track 1 |
| `src/interview/` (`/i/:studyId`, `useConversation`) | Track 2 |
| ElevenLabs dashboard agent (prompt, voice) | Track 2 |
| `src/agent/` (`suggestQuestions`, `synthesizeInterview`, `elevenlabsClient`) | Track 3 |
| `src/report/` | Track 4 |
| `src/character/` | Track 4 |

## Rules

- Merge to main every 60 to 90 minutes; pull main before each task.
- Schema is append-only: add fields and tables, never rename or reorder.
- No formatter on save, to avoid whitespace conflicts.
- Never force-push main.
