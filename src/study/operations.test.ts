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
vi.mock('../report/server', () => ({ readSavedReport: vi.fn() }));

const { updateStudy, getPublicStudy, finishInterview } = await import('./operations');

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

describe('finishInterview', () => {
  it('rejects a conversation ID that is not an ElevenLabs token', async () => {
    const findUnique = vi.fn();
    const context = { entities: { Study: { findUnique } } };
    await expect(
      call(finishInterview, { studyId: 's1', conversationId: '../agents/x' }, context),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(findUnique).not.toHaveBeenCalled();
  });
});
