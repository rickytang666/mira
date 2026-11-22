# ElevenLabs agent setup (track 2)

Agent: **Fieldwork Interviewer**, `agent_6201m823tkegekxt4ht282vbqtbj`. One agent for every study: the phone page passes each study's details in as dynamic variables when the call starts.

Every teammate who runs the app puts this in `.env.client`:

```
REACT_APP_ELEVENLABS_AGENT_ID=agent_6201m823tkegekxt4ht282vbqtbj
```

## Dynamic variables

`InterviewPage.tsx` sends `getPublicStudy().dynamicVariables` (the `InterviewDynamicVariables` type in `src/contract.ts`), plus one extra:

| Variable | Source | Notes |
| --- | --- | --- |
| `product_name` | `study.name` | **Added by track 2**, not in the contract type: the agent needs a name to say out loud, not a URL |
| `product_url` | contract | |
| `goal` | contract | |
| `audience` | contract | Falls back to "someone who has used this product" |
| `questions` | contract | Numbered, one per line. A question may end with `[Do not ask a follow-up for this question.]` |
| `product_context` | contract | Trimmed to 8,000 characters on the phone to keep each voice turn fast |
| `study_id` | contract | Not used in the prompt |

Every variable used in the prompt must always be sent, or ElevenLabs refuses to start the call. The page always sends `product_name`, `audience`, and `product_context`, even when empty.

## First message

```
Hi! Thanks for helping out. I'm going to ask you a few quick questions about {{product_name}}. It takes about a minute. Ready?
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

## Dashboard settings (as configured)

| Setting | Value |
| --- | --- |
| Voice | Emma (Adorable and Upbeat), V4 Turbo, expressive mode on |
| LLM | DeepSeek Flash 4.1, temperature about 0.3, token limit 150 |
| System tools | End call: ON |
| Turn eagerness | Patient |
| Max conversation duration | 180 s |
| Authentication | Off (public agent; the phone connects with the agent ID only) |
| Audio storage | On (the report plays quote clips from the recording) |

Expressive mode writes audio tags like `[Warmly]` into the transcript text. The phone page strips them from captions; the report should too.

## Hall-noise check

1. Open `/i/<studyId>` on a phone through the HTTPS tunnel.
2. Run a full interview standing near other teams.
3. Check: it understood you, it asked one follow-up, it ended the call itself, and the interview appears on the report.
4. If noise breaks turn-taking: hold the phone closer and use the mute button between answers as push-to-talk.
