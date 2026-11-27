import { beforeEach, describe, expect, it, vi } from 'vitest';

const prisma = vi.hoisted(() => ({
  interview: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
  $transaction: vi.fn(),
}));
const fetchConversation = vi.hoisted(() => vi.fn());
const queueReportRebuild = vi.hoisted(() => vi.fn());

vi.mock('wasp/server', () => ({ prisma }));
vi.mock('./elevenlabsClient', () => ({ fetchConversation, miraAgentId: () => 'agent_mira' }));
vi.mock('../report/server', () => ({ queueReportRebuild }));

const { processInterview } = await import('./processInterview');
const run = (args: { interviewId: string }) =>
  (processInterview as unknown as (args: { interviewId: string }) => Promise<void>)(args);

const conversation = (agentId: string) => ({
  conversationId: 'conv_1',
  agentId,
  status: 'done',
  durationSecs: 60,
  turns: [],
});

beforeEach(() => {
  vi.clearAllMocks();
  prisma.interview.findUniqueOrThrow.mockResolvedValue({ id: 'i1', studyId: 's1', conversationId: 'conv_1' });
});

describe('processInterview', () => {
  it('does not save a conversation run by another agent', async () => {
    fetchConversation.mockResolvedValue(conversation('agent_other'));
    await expect(run({ interviewId: 'i1' })).resolves.toBeUndefined();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(queueReportRebuild).not.toHaveBeenCalled();
    expect(prisma.interview.update).toHaveBeenLastCalledWith({
      where: { id: 'i1' },
      data: { status: 'failed', error: 'This conversation was not run by the Mira agent.' },
    });
  });

  it("saves a conversation run by Mira's agent", async () => {
    fetchConversation.mockResolvedValue(conversation('agent_mira'));
    await run({ interviewId: 'i1' });
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(queueReportRebuild).toHaveBeenCalledWith('s1');
  });
});
