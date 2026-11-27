import { describe, expect, it, vi } from 'vitest';
import {
  isRebuilding,
  oneRebuildAtATime,
  refreshStudyReport,
  synthesisStatus,
  type ReportRepository,
  type ReportSnapshot,
} from './pipeline';

const snapshot: ReportSnapshot = {
  revision: 4,
  study: {
    id: 's1',
    productName: 'Mira',
    productUrl: '',
    goal: 'Find setup problems',
    audience: '',
    context: 'A workflow app.',
    questions: [{ id: 'q', text: 'What blocked you?', followUp: true }],
  },
  calls: [
    {
      interviewId: 'i1',
      title: 'Participant 01',
      questions: ['What blocked you?'],
      conversation: {
        conversationId: 'c1',
        status: 'done',
        durationSecs: 15,
        turns: [{ role: 'user', text: 'I could not find settings.', timeInCallSecs: 3 }],
      },
      audioUrl: '/audio/i1',
    },
  ],
};
const generateJson = async () => ({
  summary: 'Settings were hard to find.',
  themes: [
    {
      label: 'Navigation',
      summary: 'One participant could not find settings.',
      evidence: [{ callId: 'i1', turnId: 'turn-0' }],
    },
  ],
  recommendations: [{ text: 'Test a visible settings link.', themeLabels: ['Navigation'] }],
  questionFindings: [
    { questionIndex: 0, status: 'answered', finding: 'Settings could not be found.', themeLabels: ['Navigation'] },
  ],
});
function repository(): ReportRepository {
  return { load: vi.fn(async () => snapshot), save: vi.fn(async () => true), fail: vi.fn(async () => {}) };
}

describe('saved report pipeline', () => {
  it('commits report and playable evidence against the loaded revision', async () => {
    const repo = repository();
    const report = await refreshStudyReport('s1', repo, { generateJson });
    expect(repo.save).toHaveBeenCalledWith('s1', 4, report);
    expect(report.themes[0].quotes[0]).toMatchObject({ startSec: 3, endSec: 15, audioUrl: '/audio/i1' });
    expect(repo.fail).not.toHaveBeenCalled();
  });
  it('reloads all calls when a newer revision prevents a stale write', async () => {
    const repo = repository();
    repo.save = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    repo.load = vi
      .fn()
      .mockResolvedValueOnce(snapshot)
      .mockResolvedValueOnce({ ...snapshot, revision: 5 });
    await refreshStudyReport('s1', repo, { generateJson });
    expect(repo.load).toHaveBeenCalledTimes(2);
    expect(repo.save).toHaveBeenLastCalledWith('s1', 5, expect.anything());
  });
  it('keeps the last good report on provider failure and records a scoped error', async () => {
    const repo = repository();
    await expect(
      refreshStudyReport('s1', repo, {
        generateJson: async () => {
          throw new Error('Rate limited');
        },
      }),
    ).rejects.toThrow('Rate limited');
    expect(repo.save).not.toHaveBeenCalled();
    expect(repo.fail).toHaveBeenCalledWith('s1', 4, 'Rate limited');
  });
});

describe('rebuild scheduling', () => {
  it('runs two rebuilds for one study one after another, not in parallel', async () => {
    const events: string[] = [];
    const releases: Array<() => void> = [];
    const slowJson = async () => {
      events.push('model start');
      await new Promise<void>((resolve) => releases.push(resolve));
      events.push('model end');
      return generateJson();
    };
    const repo = repository();
    const first = oneRebuildAtATime('s1', () => refreshStudyReport('s1', repo, { generateJson: slowJson }));
    const second = oneRebuildAtATime('s1', () => refreshStudyReport('s1', repo, { generateJson: slowJson }));
    await vi.waitFor(() => expect(releases).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(releases).toHaveLength(1);
    expect(repo.load).toHaveBeenCalledTimes(1);
    expect(isRebuilding('s1')).toBe(true);
    releases[0]();
    await vi.waitFor(() => expect(releases).toHaveLength(2));
    releases[1]();
    await Promise.all([first, second]);
    expect(events).toEqual(['model start', 'model end', 'model start', 'model end']);
    await vi.waitFor(() => expect(isRebuilding('s1')).toBe(false));
  });
  it('does not hold up another study, and a failed rebuild does not block the next one', async () => {
    let release = () => {};
    const blocked = oneRebuildAtATime('a', () => new Promise<void>((resolve) => (release = resolve)));
    await expect(oneRebuildAtATime('b', async () => 'other study')).resolves.toBe('other study');
    release();
    await blocked;
    await expect(
      oneRebuildAtATime('a', async () => {
        throw new Error('Rate limited');
      }),
    ).rejects.toThrow('Rate limited');
    await expect(oneRebuildAtATime('a', async () => 'next')).resolves.toBe('next');
  });
});

describe('report status', () => {
  const base = { error: false, savedRevision: 4, revision: 4, done: 2, rebuildPending: async () => false };
  it('shows an edited study as out of date when nothing will rebuild it', async () => {
    expect(await synthesisStatus({ ...base, revision: 5 })).toBe('stale');
  });
  it('shows analyzing only while a rebuild or an interview is pending', async () => {
    expect(await synthesisStatus({ ...base, revision: 5, rebuildPending: async () => true })).toBe('processing');
    expect(
      await synthesisStatus({ ...base, savedRevision: undefined, done: 0, rebuildPending: async () => true }),
    ).toBe('processing');
  });
  it('keeps ready, failed and empty studies as they were', async () => {
    const pending = vi.fn(async () => true);
    expect(await synthesisStatus({ ...base, rebuildPending: pending })).toBe('ready');
    expect(await synthesisStatus({ ...base, revision: 5, error: true })).toBe('failed');
    expect(await synthesisStatus({ ...base, savedRevision: undefined, revision: 1, done: 0 })).toBe('waiting');
    expect(pending).not.toHaveBeenCalled();
  });
});
