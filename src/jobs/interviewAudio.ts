import type { InterviewAudio } from 'wasp/server/api';
import { fetchConversationAudio } from './elevenlabsClient';

type Audio = { bytes: Buffer; contentType: string };

export type ByteRange = { start: number; end: number };

// Single-range RFC 9110 byte ranges; null means ignore the header and serve the whole file.
export function parseRange(header: string | undefined, length: number): ByteRange | 'unsatisfiable' | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header?.trim() ?? '');
  if (!match || (!match[1] && !match[2])) return null;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (suffix === 0 || length === 0) return 'unsatisfiable';
    return { start: Math.max(0, length - suffix), end: length - 1 };
  }
  const start = Number(match[1]);
  if (match[2] && Number(match[2]) < start) return null;
  if (start >= length) return 'unsatisfiable';
  return { start, end: match[2] ? Math.min(Number(match[2]), length - 1) : length - 1 };
}

export const AUDIO_CACHE_CAP_BYTES = 50 * 1024 * 1024;

// LRU by total bytes; storing the promise lets parallel misses for one recording share a single download.
export function createAudioCache(capBytes: number, load: (conversationId: string) => Promise<Audio>) {
  const entries = new Map<string, { audio: Promise<Audio>; size: number }>();
  let totalBytes = 0;

  function remove(key: string) {
    const entry = entries.get(key);
    if (!entry) return;
    totalBytes -= entry.size;
    entries.delete(key);
  }

  function get(key: string, conversationId: string): Promise<Audio> {
    const hit = entries.get(key);
    if (hit) {
      entries.delete(key);
      entries.set(key, hit);
      return hit.audio;
    }
    const entry = { audio: load(conversationId), size: 0 };
    entries.set(key, entry);
    entry.audio.then(
      (audio) => {
        if (entries.get(key) !== entry) return;
        entry.size = audio.bytes.length;
        totalBytes += entry.size;
        // Map iterates oldest first; in-flight entries have size 0 and are kept.
        for (const [oldKey, old] of entries) {
          if (totalBytes <= capBytes) break;
          if (old.size > 0) remove(oldKey);
        }
      },
      () => {
        if (entries.get(key) === entry) entries.delete(key);
      },
    );
    return entry.audio;
  }

  return { get, totalBytes: () => totalBytes, keys: () => [...entries.keys()] };
}

const audioCache = createAudioCache(AUDIO_CACHE_CAP_BYTES, fetchConversationAudio);

export const interviewAudio: InterviewAudio = async (req, res, context) => {
  const interview = await context.entities.Interview.findUnique({ where: { id: String(req.params.interviewId) } });
  if (!interview) {
    res.status(404).end();
    return;
  }
  const { bytes, contentType } = await audioCache.get(interview.id, interview.conversationId);
  // The client runs on a different origin, and the default same-origin policy would block it from playing the file.
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Accept-Ranges', 'bytes');
  // Range support lets the browser seek straight to a quote's start.
  const range = parseRange(req.headers.range, bytes.length);
  if (range === 'unsatisfiable') {
    res.status(416);
    res.setHeader('Content-Range', `bytes */${bytes.length}`);
    res.end();
    return;
  }
  res.setHeader('Content-Type', contentType);
  if (range) {
    res.status(206);
    res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${bytes.length}`);
    res.setHeader('Content-Length', String(range.end - range.start + 1));
    res.end(bytes.subarray(range.start, range.end + 1));
    return;
  }
  res.setHeader('Content-Length', String(bytes.length));
  res.end(bytes);
};
