import type { InterviewAudio } from 'wasp/server/api';
import { fetchConversationAudio } from './elevenlabsClient';

// Recordings are small (60 to 90 s), so keep each one in memory after the first fetch.
const audioCache = new Map<string, { bytes: Buffer; contentType: string }>();

export const interviewAudio: InterviewAudio = async (req, res, context) => {
  const interview = await context.entities.Interview.findUnique({ where: { id: String(req.params.interviewId) } });
  if (!interview) {
    res.status(404).end();
    return;
  }
  let audio = audioCache.get(interview.id);
  if (!audio) {
    audio = await fetchConversationAudio(interview.conversationId);
    audioCache.set(interview.id, audio);
  }
  const { bytes, contentType } = audio;
  // The client runs on a different origin, and the default same-origin policy would block it from playing the file.
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Content-Type', contentType);
  res.setHeader('Accept-Ranges', 'bytes');
  // Range support lets the browser seek straight to a quote's start.
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), bytes.length - 1) : bytes.length - 1;
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${bytes.length}`);
    res.setHeader('Content-Length', String(end - start + 1));
    res.end(bytes.subarray(start, end + 1));
    return;
  }
  res.setHeader('Content-Length', String(bytes.length));
  res.end(bytes);
};
