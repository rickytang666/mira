import type { ProcessInterview } from "wasp/server/jobs";
import type { SynthesizeInterviewInput, SynthesizeInterviewOutput } from "../contract";
import { fetchConversation } from "./elevenlabsClient";

const POLL_INTERVAL_MS = 1500;
const POLL_ATTEMPTS = 20; // about 30 s for ElevenLabs to finish post-call processing

// Placeholder until the LLM synthesizeInterview in src/agent lands: every substantial answer becomes a quote.
async function synthesizeInterview(input: SynthesizeInterviewInput): Promise<SynthesizeInterviewOutput> {
  const userTurns = input.turns.filter((turn) => turn.role === "user");
  const quotes = userTurns
    .map((turn) => {
      const next = input.turns.find((t) => t.timeInCallSecs > turn.timeInCallSecs);
      return { text: turn.text, startSec: turn.timeInCallSecs, endSec: next?.timeInCallSecs ?? turn.timeInCallSecs + 10 };
    })
    .filter((quote) => quote.text.split(/\s+/).length >= 6)
    .slice(0, 3);
  return { themes: quotes.length ? [{ label: "First impressions", quotes }] : [] };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const processInterview: ProcessInterview<{ interviewId: string }, { themes: number }> = async (
  { interviewId },
  context,
) => {
  const interview = await context.entities.Interview.findUniqueOrThrow({
    where: { id: interviewId },
    include: { study: { include: { questions: { orderBy: { order: "asc" } }, themes: true } } },
  });
  try {
    let conversation = await fetchConversation(interview.conversationId);
    for (let attempt = 1; attempt < POLL_ATTEMPTS && !["done", "failed"].includes(conversation.status); attempt++) {
      await sleep(POLL_INTERVAL_MS);
      conversation = await fetchConversation(interview.conversationId);
    }
    if (conversation.status !== "done") throw new Error(`conversation status is ${conversation.status}`);

    const { themes } = await synthesizeInterview({
      goal: interview.study.goal,
      questions: interview.study.questions.map((q) => q.text),
      turns: conversation.turns,
      existingThemeLabels: interview.study.themes.map((t) => t.label),
    });

    for (const theme of themes) {
      const saved = await context.entities.Theme.upsert({
        where: { studyId_label: { studyId: interview.studyId, label: theme.label } },
        create: { studyId: interview.studyId, label: theme.label, count: 1 },
        update: { count: { increment: 1 } },
      });
      await context.entities.Quote.createMany({
        data: theme.quotes.map((quote) => ({ ...quote, interviewId, themeId: saved.id })),
      });
    }
    await context.entities.Interview.update({
      where: { id: interviewId },
      data: { status: "done", durationSecs: conversation.durationSecs },
    });
    console.log(`processed interview ${interviewId}: ${themes.length} themes`);
    return { themes: themes.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await context.entities.Interview.update({ where: { id: interviewId }, data: { status: "failed", error: message } });
    console.error(`interview ${interviewId} failed: ${message}`);
    return { themes: 0 };
  }
};
