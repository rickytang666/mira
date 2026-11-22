# Ownership

Who edits what. To change a file you don't own, ask its owner.

| Track | Owner | Work |
| --- | --- | --- |
| 1. Data and wiring | Ricky | Postgres, tables, operations, the `processInterview` job, transcript and audio fetch, audio route, HTTPS tunnels |
| 2. Voice interview | Tian | ElevenLabs agent, the phone interview page, QR code |
| 3. Brains and report | Alex | Question generation, transcript to themes and quotes, the report page |
| 4. Character | Skeleton author | The on-screen character on the phone interview page |

## File tree

The number is the owning track. `(new)` means the folder doesn't exist yet; its owner creates it.

```text
main.wasp.ts               1    routes, operations, job; others ask, append at the end
schema.prisma              1    data model, append-only
package.json + lock file   1    installs every dependency; regenerate the lock, never merge it
.gitignore, .env.*.example 1    new env variables: ask track 1 to append a line
docs/                      all  IDEA.md, TECH.md, this file
src/
  contract.ts              3    types that cross tracks; a change is a team announcement
  Layout.tsx, Main.css     1    sidebar, page header, shared styles
  store.ts                 1    study held in browser storage today; replaced by the database
  sources.ts               1    website and MCP import (server actions)
  study/                   1    KnowledgePage, QuestionnairePage
  interview/  (new)        2    /i/:studyId, useConversation, finishInterview call
  agent/      (new)        3    suggestQuestions, synthesizeInterview
  report/                  3    ReportPage, quote playback
  jobs/       (new)        1    processInterview, elevenlabsClient (transcript + audio fetch)
  character/  (new)        4    the character, one component with a `speaking` prop; track 2 mounts it
ElevenLabs dashboard agent 2    prompt, voice, dynamic variables
```

New styles go in a CSS file inside your own folder, not in `Main.css`.

## Rules

- Pull main before each task. Merge to main at least every 90 minutes.
- Schema is append-only: add fields and tables, never rename or reorder.
- No formatter on save, to avoid whitespace conflicts.
- Never force-push main.
