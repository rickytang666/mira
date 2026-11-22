# Fieldwork

Give it your product's context and it interviews real people out loud, then hands you the research report. Built on Wasp and ElevenLabs.

## Run it

1. Node 24.22.1 or newer (`nvm use 24.22.3`) and the Wasp CLI 0.26.1.
2. Copy `.env.server.example` to `.env.server` and `.env.client.example` to `.env.client`.
3. Database: `createdb fieldwork`, put your Mac username in `DATABASE_URL`, then `wasp db migrate-dev`.
4. `npm run dev` starts the client on port 3002 and the server on 3003.
5. `npm run check` compiles and typechecks.
6. Phones need HTTPS: `npm run tunnels` in one terminal (keep it running), then `npm run dev:tunnel` instead of `npm run dev`, and open the client URL it prints.

## Docs

- [docs/IDEA.md](docs/IDEA.md): what we're building and what's in scope.
- [docs/TECH.md](docs/TECH.md): architecture, data model, what exists and what's planned.
- [docs/OWNERSHIP.md](docs/OWNERSHIP.md): tracks, owners, and the file tree.
- [src/contract.ts](src/contract.ts): types that cross tracks. Changing it is a team announcement.
