# ElevenLabs agent setup

One ElevenLabs Conversational AI agent, **Mira**, runs every study. The phone page passes each study's details in as dynamic variables when the call starts. Its config lives in [`agent/`](../agent), and one command creates or updates the agent from it.

Put `ELEVENLABS_API_KEY` in `.env.server`. The key needs the ElevenLabs Agents write permission (`convai_write`). Then run:

```bash
npm run setup:agent
```

- With `REACT_APP_ELEVENLABS_AGENT_ID` unset, it creates an agent and prints its ID for both env files: the first line goes in `.env.client` for the phone, the second in `.env.server` so the interview job only saves calls from this agent:

  ```
  REACT_APP_ELEVENLABS_AGENT_ID=<your-agent-id>
  ELEVENLABS_AGENT_ID=<your-agent-id>
  ```

- With it set, it updates that agent to match `agent/`. Run it again after editing the prompt or settings. Dashboard edits to the fields it sets get overwritten. It never turns on agent versioning, which ElevenLabs cannot turn off again.

## Dynamic variables

`InterviewPage.tsx` sends `getPublicStudy().dynamicVariables` (the `InterviewDynamicVariables` type in `src/contract.ts`), plus `product_name`:

| Variable          | Source       | Notes                                                                                         |
| ----------------- | ------------ | --------------------------------------------------------------------------------------------- |
| `product_name`    | `study.name` | Not in the contract type: the agent needs a name to say out loud, not a URL                   |
| `product_url`     | contract     |                                                                                               |
| `goal`            | contract     |                                                                                               |
| `audience`        | contract     | Falls back to "someone who has used this product"                                             |
| `questions`       | contract     | Numbered, one per line. A question may end with `[Do not ask a follow-up for this question.]` |
| `product_context` | contract     | Trimmed to 8,000 characters on the server to keep each voice turn fast                        |
| `study_id`        | contract     | Not used in the prompt                                                                        |

Every variable used in the prompt must always be sent, or ElevenLabs refuses to start the call. The page always sends `product_name`, `audience`, and `product_context`, even when empty.

## First message and system prompt

They live in [`agent/first-message.txt`](../agent/first-message.txt) and [`agent/system-prompt.txt`](../agent/system-prompt.txt). `npm run setup:agent` sends them as-is.

## Settings

Set in [`agent/config.ts`](../agent/config.ts), matching the live agent as read from the API on 2026-11-26.

| Setting                   | Value                                                                  |
| ------------------------- | ---------------------------------------------------------------------- |
| Voice                     | voice ID `ZanLYTrbe2MUsXisnpwn`, `eleven_v4_turbo`, expressive mode on |
| LLM                       | `deepseek-v41-flash`, temperature 0, no token limit                    |
| System tools              | End call on                                                            |
| Turn eagerness            | Normal                                                                 |
| Max conversation duration | 600 s                                                                  |
| Authentication            | Off: the phone connects with the agent ID only, so set call limits     |
| Audio storage             | On: the report plays quote clips from the recording                    |

Expressive mode writes audio tags like `[Warmly]` into the transcript text. The phone page strips them from captions.
