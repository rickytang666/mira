import { describe, expect, it, vi } from 'vitest';

vi.mock('wasp/server', () => ({
  HttpError: class HttpError extends Error {
    statusCode: number;
    constructor(statusCode: number, message: string) {
      super(message);
      this.statusCode = statusCode;
    }
  },
  config: { serverUrl: 'http://localhost:3001' },
}));

const { getInterview } = await import('./operations');

const transcript = { durationSecs: 20, turns: [{ role: 'user', text: 'It was hard to set up.', timeInCallSecs: 2 }] };
const interview = (overrides: object) => ({
  id: 'i1',
  status: 'done',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  durationSecs: 20,
  transcript,
  questionSnapshot: ['Why?', 3, 'How?'],
  ...overrides,
});
const contextFor = (row: object) => ({
  entities: {
    Study: { findUnique: async () => ({ name: 'Acme', interviews: [] }) },
    Interview: { findFirst: async () => row },
  },
});
const run = (row: object) =>
  (getInterview as unknown as (args: unknown, context: unknown) => Promise<Record<string, unknown>>)(
    { studyId: 's1', interviewId: 'i1' },
    contextFor(row),
  );

describe('getInterview', () => {
  it('keeps only text questions from the saved snapshot and links the audio route', async () => {
    const view = await run(interview({}));
    expect(view.questions).toEqual(['Why?', 'How?']);
    expect(view.audioUrl).toBe('http://localhost:3001/api/interviews/i1/audio');
  });

  it('has no questions or audio for a call without a snapshot or transcript', async () => {
    const view = await run(interview({ transcript: null, questionSnapshot: null }));
    expect(view.questions).toEqual([]);
    expect(view.audioUrl).toBeNull();
  });
});
