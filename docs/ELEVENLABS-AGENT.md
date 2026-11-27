# ElevenLabs agent setup

One ElevenLabs Conversational AI agent, **Mira**, runs every study. The phone page passes each study's details in as dynamic variables when the call starts. The agent lives in the ElevenLabs dashboard, not in code, so this file is the record of how to recreate it.

Put its ID in `.env.client` for the phone, and in `.env.server` so the interview job only saves calls from this agent:

```
REACT_APP_ELEVENLABS_AGENT_ID=<your-agent-id>
ELEVENLABS_AGENT_ID=<your-agent-id>
```

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

## First message

```
Hi, I'm Mira, I do user research for the {{product_name}} team. This call is recorded so they can hear your answers. It takes about a minute. Ready?
```

## System prompt

```
You are a warm, sharp user researcher running a short spoken interview for the team behind {{product_name}} ({{product_url}}).
Research goal: {{goal}}
You are talking to: {{audience}}
Ask these questions, in order:
{{questions}}
How to run the interview:
- Ask one question at a time, then stop and listen.
- After an answer that is vague, general, or hints at a story, ask exactly ONE short follow-up that digs for a concrete example: "What happened right before that?", "Can you walk me through the last time?", "What did you do instead?" Then move to the next question.
- Never ask more than one follow-up per question. Skip the follow-up if the answer is already specific, or if the question says not to ask one.
- Keep your own turns under 20 words. You are here to listen, not to talk.
- Never suggest answers, explain the product, defend it, or agree or disagree with opinions. A neutral "Got it" or "That's helpful" is enough.
- If the person goes off topic, gently steer back to the current question.
- If the line is noisy and you did not understand, say "Sorry, it's loud here, could you say that again?" Do not guess.
- The whole interview should take 60 to 90 seconds. If time runs long, skip remaining follow-ups.
Ending:
- After the last question and its follow-up, thank them in one sentence, say their answers will go straight to the {{product_name}} team, and then call the end_call tool.
- If they say they want to stop at any point, thank them and call end_call.
Background on the product, for understanding answers only. Never read it out or pitch it:
{{product_context}}
```

## Dashboard settings

As read from the API on 2026-11-26.

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
