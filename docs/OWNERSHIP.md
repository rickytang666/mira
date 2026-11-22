# Ownership

Who edits what. To change a file you don't own, ask its owner.

| Track | Owner | Work |
| --- | --- | --- |
| 1. Data and wiring | Ricky | Postgres, tables, operations, the `processInterview` job, audio route, deploy |
| 2. Voice interview | TBD | ElevenLabs agent, the phone interview page, QR code |
| 3. Agent brains | TBD | Question generation, transcript to themes and quotes |
| 4. Report and character | Skeleton author | Report page, quote playback, the on-screen character |

## File tree

The number is the owning track. `(new)` means the folder doesn't exist yet; its owner creates it.

```text
main.wasp.ts               1    routes, operations, job; others ask, append at the end
schema.prisma              1    data model, append-only
package.json + lock file   1    installs every dependency; regenerate the lock, never merge it
.gitignore, .env.example   1
docs/                      all  IDEA.md, TECH.md, this file
src/
  contract.ts              3    types that cross tracks; a change is a team announcement
  Layout.tsx, Main.css     1    sidebar, page header, shared styles
  store.ts                 1    study held in browser storage today; replaced by the database
  sources.ts               1    website and MCP import (server actions)
  study/                   1    KnowledgePage, QuestionnairePage
  interview/  (new)        2    /i/:studyId, useConversation, finishInterview call
  agent/      (new)        3    suggestQuestions, synthesizeInterview, elevenlabsClient
  report/                  4    ReportPage
  character/  (new)        4    the character, one component with a `speaking` prop
ElevenLabs dashboard agent 2    prompt, voice, dynamic variables
```

New styles go in a CSS file inside your own folder, not in `Main.css`.

## Rules

- Pull main before each task. Merge to main at least every 90 minutes.
- Schema is append-only: add fields and tables, never rename or reorder.
- No formatter on save, to avoid whitespace conflicts.
- Never force-push main.
