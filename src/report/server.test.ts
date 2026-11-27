import { describe, expect, it, vi } from 'vitest';

const findUniqueOrThrow = vi.hoisted(() => vi.fn());

vi.mock('wasp/server', () => ({
  config: { serverUrl: 'http://localhost:3001' },
  prisma: { study: { findUniqueOrThrow } },
}));
vi.mock('wasp/server/jobs', () => ({ rebuildStudyReport: { submit: vi.fn() } }));
vi.mock('../jobs/elevenlabsClient', () => ({ fetchConversation: vi.fn() }));

const { reportRepository } = await import('./server');

const words = 'I could not find where the API key settings live at all';
const transcript = (conversationId: string) => ({
  conversationId,
  status: 'done',
  durationSecs: 30,
  turns: [{ role: 'user', text: words, timeInCallSecs: 2 }],
});

describe('reportRepository.load', () => {
  it('sends substantive calls with their saved questions and audio route', async () => {
    findUniqueOrThrow.mockResolvedValue({
      id: 's1',
      name: 'Acme',
      productUrl: '',
      goal: 'Learn',
      audience: '',
      context: '',
      reportRevision: 4,
      questions: [],
      interviews: [
        { id: 'i1', transcript: transcript('c1'), questionSnapshot: ['Why?', 7] },
        { id: 'short', transcript: { ...transcript('c2'), durationSecs: 3 }, questionSnapshot: ['Why?'] },
        { id: 'i2', transcript: transcript('c3'), questionSnapshot: null },
      ],
    });
    const snapshot = await reportRepository.load('s1');
    expect(snapshot.revision).toBe(4);
    expect(
      snapshot.calls.map(({ interviewId, title, questions, audioUrl }) => ({
        interviewId,
        title,
        questions,
        audioUrl,
      })),
    ).toEqual([
      {
        interviewId: 'i1',
        title: 'Participant 01',
        questions: ['Why?'],
        audioUrl: 'http://localhost:3001/api/interviews/i1/audio',
      },
      {
        interviewId: 'i2',
        title: 'Participant 02',
        questions: [],
        audioUrl: 'http://localhost:3001/api/interviews/i2/audio',
      },
    ]);
  });
});
