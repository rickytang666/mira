# Mira

Mira runs short voice interviews with your users and turns them into a report. You give it your product and what you want to learn; it writes the questions, interviews people on their phones, and returns themes with quotes you can play back in the participant's voice.

It's open source and runs on your own ElevenLabs and OpenRouter keys.

## How it works

1. **Brief.** Add your product as a URL, a description, a PDF or an MCP server. Mira writes 3 to 5 interview questions from it, which you can edit.
2. **Interview.** Participants scan a QR code and talk to Mira for about a minute, with no app or sign-up. Mira says up front that the call is recorded for your team, and switches to the participant's language if they answer in another one.
3. **Report.** After each call, Mira saves the transcript and rebuilds the study report: a summary, themes, and quotes linked to the moment they were said.

When an answer is vague, Mira asks one concrete follow-up, then moves on. It's built for quick signal, not deep discovery interviews.

## Tech stack

- **ElevenLabs Conversational AI**: voice interviews, transcripts and recordings
- **Wasp 0.26**: React 19, Prisma, PostgreSQL, pg-boss
- **OpenRouter**: DeepSeek V4.1 Flash for questions and reports
- **Biome, Vitest, GitHub Actions**: lint, tests and CI

How the pieces connect: [`src/agent/INTEGRATION.md`](src/agent/INTEGRATION.md). Voice agent config: [`docs/ELEVENLABS-AGENT.md`](docs/ELEVENLABS-AGENT.md).

## Run it locally

Needs Node.js 24.22.1+, PostgreSQL, an ElevenLabs key with Agents write permission, and an OpenRouter key.

```bash
npm install -g @wasp.sh/wasp-cli@0.26.1
npm ci && npm run setup:wasp
cp .env.server.example .env.server   # fill in before setup:agent
cp .env.client.example .env.client
npm run setup:agent                  # add the two agent ID lines it prints
createdb mira && wasp db migrate-dev
npm run dev                          # client :3002, server :3003
```

- **On a phone:** phones need HTTPS for the mic. Install `cloudflared`, run `npm run tunnels`, then `npm run dev:tunnel` and open the URL it prints.
- **Checks:** `npm run verify` runs compile, typecheck, Biome and Vitest, with no database or keys. CI runs it on every PR.

## Limitations

- No accounts: anyone who can reach the app sees every study
- Agent auth is off: set call limits in ElevenLabs
- A report covers up to 100,000 transcript characters

## License

MIT. See [LICENSE](LICENSE).
