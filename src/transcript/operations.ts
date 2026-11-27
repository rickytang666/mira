import { HttpError } from 'wasp/server';
import type { GetInterview } from 'wasp/server/operations';
import { interviewAudioUrl } from '../jobs/audioUrl';
import { participantTitles } from '../report/participants';
import { type InterviewView, transcriptLines } from './turns';

// Founder-side, no login, the same access as getReport.
export const getInterview: GetInterview<{ studyId: string; interviewId: string }, InterviewView> = async (
  { studyId, interviewId },
  context,
) => {
  if (!studyId || !interviewId) throw new HttpError(400, 'Missing study or interview.');
  const study = await context.entities.Study.findUnique({
    where: { id: studyId },
    include: { interviews: { select: { id: true, createdAt: true, transcript: true } } },
  });
  const interview = study ? await context.entities.Interview.findFirst({ where: { id: interviewId, studyId } }) : null;
  if (!study || !interview) throw new HttpError(404, 'Interview not found.');
  const turns = transcriptLines(interview.transcript);
  return {
    studyId,
    interviewId,
    productName: study.name,
    participantLabel: participantTitles(study.interviews).get(interview.id) ?? 'Short call',
    status: interview.status,
    createdAt: interview.createdAt.toISOString(),
    durationSecs: interview.durationSecs,
    questions: Array.isArray(interview.questionSnapshot)
      ? interview.questionSnapshot.filter((q): q is string => typeof q === 'string')
      : [],
    turns,
    audioUrl: turns.length ? interviewAudioUrl(interview.id) : null,
  };
};
