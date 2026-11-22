# Mira

Mira is a user researcher you can hire in a minute. Give her your product's URL and what you want to learn. She writes the interview, talks to your users by voice on their phones, and hands you a report of themes and quotes you can play back in their own voices.

## How it works

1. **Brief.** Mira reads your site and writes 3 to 5 interview questions about it.
2. **Interviews.** Participants scan a QR code and talk to Mira for about a minute. No app, no sign-up.
3. **Report.** After each call, Mira pulls the transcript and recording, groups answers into themes, and links every quote to the moment it was said.

## Built with

- **ElevenLabs** Conversational AI runs the spoken interview; its transcripts and recordings feed the report.
- **Wasp** (React, Node.js, Prisma, PostgreSQL) for the app, the data and the background job that builds each report.
- **OpenRouter** (Gemini 2.5 Flash) writes the questions and synthesizes the report.

## Run it locally

You need Node.js 24.22.1 or newer, the Wasp CLI 0.26.1, PostgreSQL, an ElevenLabs API key and agent, and an OpenRouter API key.

```bash
cp .env.server.example .env.server   # add your keys and DATABASE_URL
cp .env.client.example .env.client   # add your ElevenLabs agent ID
createdb fieldwork
wasp db migrate-dev
npm run dev                          # client on :3002, server on :3003
```

Phones need HTTPS for the microphone. Run `npm run tunnels` in one terminal and leave it running, then `npm run dev:tunnel` instead of `npm run dev`, and open the client URL it prints.
