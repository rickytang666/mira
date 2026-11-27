import { beforeEach, describe, expect, it, vi } from 'vitest';

const tx = vi.hoisted(() => ({
  study: { update: vi.fn() },
  question: { deleteMany: vi.fn(), createMany: vi.fn() },
}));

vi.mock('wasp/server', () => ({
  HttpError: class HttpError extends Error {
    statusCode: number;
    constructor(statusCode: number, message: string) {
      super(message);
      this.statusCode = statusCode;
    }
  },
  config: { serverUrl: 'http://localhost:3001' },
  prisma: { $transaction: vi.fn(async (run: (client: typeof tx) => Promise<void>) => run(tx)) },
}));
vi.mock('wasp/server/jobs', () => ({ processInterview: { submit: vi.fn() } }));
vi.mock('../sources', () => ({ importWebsite: vi.fn() }));
vi.mock('../agent/suggestQuestions', () => ({ suggestQuestions: vi.fn() }));
vi.mock('../report/server', () => ({ readSavedReport: vi.fn(), rebuildQueued: vi.fn(async () => false) }));

const { updateStudy, addSource, getPublicStudy, finishInterview, getReport } = await import('./operations');
const { readSavedReport } = await import('../report/server');

// Operations receive client JSON, so tests pass shapes the TypeScript input type would reject.
const call = (operation: unknown, args: unknown, context: unknown = {}) =>
  (operation as (args: unknown, context: unknown) => Promise<unknown>)(args, context);

beforeEach(() => vi.clearAllMocks());

describe('updateStudy', () => {
  it('writes only the editable fields', async () => {
    await call(updateStudy, {
      studyId: 's1',
      name: ' Acme ',
      goal: 'Learn onboarding',
      logo: 'data:image/png;base64,x',
      report: { hacked: true },
      context: 'replaced',
      id: 'other',
    });
    expect(tx.study.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: {
        name: 'Acme',
        goal: 'Learn onboarding',
        audience: undefined,
        reportRevision: { increment: 1 },
        reportError: null,
      },
    });
  });

  it('rejects an empty product name', async () => {
    await expect(call(updateStudy, { studyId: 's1', name: '   ' })).rejects.toMatchObject({ statusCode: 400 });
    expect(tx.study.update).not.toHaveBeenCalled();
  });

  it('rejects a goal longer than the agents accept', async () => {
    await expect(call(updateStudy, { studyId: 's1', goal: 'x'.repeat(4001) })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('keeps only text and follow-up from each question', async () => {
    await call(updateStudy, { studyId: 's1', questions: [{ text: ' Why? ', followUp: false, studyId: 'other' }] });
    expect(tx.question.createMany).toHaveBeenCalledWith({
      data: [{ studyId: 's1', text: 'Why?', followUp: false, order: 0 }],
    });
  });
});

describe('getPublicStudy', () => {
  it('sends at most 8,000 characters of product context', async () => {
    const study = {
      id: 's1',
      name: 'Acme',
      productUrl: '',
      goal: 'Learn',
      audience: '',
      logo: null,
      context: 'k'.repeat(40_000),
      questions: [{ id: 'q1', text: 'Why?', followUp: true }],
    };
    const context = { entities: { Study: { findUnique: async () => study } } };
    const result = (await call(getPublicStudy, { studyId: 's1' }, context)) as {
      dynamicVariables: { product_context: string };
    };
    expect(result.dynamicVariables.product_context.length).toBeLessThanOrEqual(8000);
  });
});

describe('addSource', () => {
  const entities = () => ({
    Source: { create: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    Study: { update: vi.fn() },
  });
  const source = { studyId: 's1', kind: 'description', title: 'Notes', content: 'Some text', detail: '2 words' };

  it('writes only the source fields', async () => {
    const e = entities();
    await call(addSource, { ...source, id: 'forged', createdAt: 'x' }, { entities: e });
    expect(e.Source.create).toHaveBeenCalledWith({ data: source });
  });

  it('rejects an unknown kind and oversized content', async () => {
    const e = entities();
    await expect(call(addSource, { ...source, kind: 'script' }, { entities: e })).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(call(addSource, { ...source, content: 'x'.repeat(100_001) }, { entities: e })).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(e.Source.create).not.toHaveBeenCalled();
  });
});

describe('finishInterview', () => {
  it('rejects a conversation ID that is not an ElevenLabs token', async () => {
    const findUnique = vi.fn();
    const context = { entities: { Study: { findUnique } } };
    await expect(
      call(finishInterview, { studyId: 's1', conversationId: '../agents/x' }, context),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('rejects a question snapshot over the saved-question limits', async () => {
    const upsert = vi.fn().mockResolvedValue({ id: 'i1', studyId: 's1', status: 'done' });
    const context = { entities: { Study: { findUnique: async () => ({ questions: [] }) }, Interview: { upsert } } };
    const finish = (questionSnapshot: unknown) =>
      call(finishInterview, { studyId: 's1', conversationId: 'conv_1', questionSnapshot }, context);
    await expect(finish(Array(51).fill('Why?'))).rejects.toMatchObject({ statusCode: 400 });
    await expect(finish(['x'.repeat(2001)])).rejects.toMatchObject({ statusCode: 400 });
    expect(upsert).not.toHaveBeenCalled();
    await expect(finish([...Array(49).fill('Why?'), 'x'.repeat(2000)])).resolves.toEqual({ interviewId: 'i1' });
  });
});

describe('getReport', () => {
  const study = {
    id: 's1',
    name: 'Acme',
    goal: 'Learn',
    report: null,
    reportError: null,
    reportRevision: 1,
    interviews: [{ status: 'done' }],
    themes: [
      {
        id: 't1',
        label: 'Setup',
        count: 1,
        quotes: [{ id: 'q1', text: 'Hard', startSec: 1, endSec: 2, interviewId: 'i1' }],
      },
    ],
  };
  const context = { entities: { Study: { findUnique: async () => study } } };
  const audioUrls = (report: unknown) =>
    (report as { themes: { quotes: { audioUrl: string }[] }[] }).themes.flatMap((t) => t.quotes.map((q) => q.audioUrl));

  it('serves stored quotes through the interview audio route', async () => {
    const report = await call(getReport, { studyId: 's1' }, context);
    expect(audioUrls(report)).toEqual(['http://localhost:3001/api/interviews/i1/audio']);
  });

  it('points saved quotes from an interview at the audio route and keeps other audio', async () => {
    vi.mocked(readSavedReport).mockReturnValueOnce({
      revision: 1,
      value: {
        studyId: 's1',
        goal: 'Learn',
        interviewsDone: 1,
        interviewsProcessing: 0,
        themes: [
          {
            id: 't1',
            label: 'Setup',
            count: 1,
            quotes: [
              { id: 'q1', text: 'Hard', startSec: 1, interviewId: 'i2', audioUrl: 'stale' },
              { id: 'q2', text: 'Pasted', startSec: 0, audioUrl: 'pasted.mp3' },
            ],
          },
        ],
      },
    });
    const report = await call(getReport, { studyId: 's1' }, context);
    expect(audioUrls(report)).toEqual(['http://localhost:3001/api/interviews/i2/audio', 'pasted.mp3']);
  });
});
