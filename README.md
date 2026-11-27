# Mira

Mira is a user researcher you can hire in a minute. Give her your product's URL and what you want to learn. She writes the interview, talks to your users by voice on their phones, and hands you a report of themes and quotes you can play back in their own voices.

Open source and runs on your own ElevenLabs and OpenRouter keys.

## How it works

1. **Brief.** Mira reads your site and writes 3 to 5 interview questions about it.
2. **Interviews.** Participants scan a QR code and talk to Mira for about a minute. No app, no sign-up. Mira tells them up front that the call is recorded and shared with your team. When an answer is vague she asks one concrete follow-up; she's built for quick signal, not deep discovery interviews.
3. **Report.** After each call, Mira pulls the transcript and recording, groups answers into themes, and links every quote to the moment it was said.

## Built with

- **ElevenLabs Conversational AI** runs every interview:
  - one voice agent, given each study's product, goal and questions as dynamic variables when the call starts
  - expressive speech, natural follow-ups, and the `end_call` tool so Mira ends the interview herself
  - after the call, the transcript with per-turn timestamps and the recording, which let each quote play from the moment it was said
- **Wasp** is the full stack:
  - React pages, operations and auth-free participant links on Prisma and PostgreSQL
  - a PgBoss background job that processes each finished interview, with retries
  - a custom API route that serves recordings with byte ranges, so the player can seek to a quote
- **OpenRouter** (DeepSeek V4.1 Flash) writes the questions and synthesizes the report.

## Run it locally

You need Node.js 24.22.1 or newer, the Wasp CLI 0.26.1, PostgreSQL, an ElevenLabs API key and agent ([setup](docs/ELEVENLABS-AGENT.md)), and an OpenRouter API key.

```bash
cp .env.server.example .env.server   # add your keys, DATABASE_URL and ELEVENLABS_AGENT_ID
cp .env.client.example .env.client   # add your ElevenLabs agent ID
createdb mira
wasp db migrate-dev
npm run dev                          # client on :3002, server on :3003
```

Phones need HTTPS for the microphone. Run `npm run tunnels` in one terminal and leave it running, then `npm run dev:tunnel` instead of `npm run dev`, and open the client URL it prints.
