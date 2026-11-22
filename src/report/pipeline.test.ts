import { describe, expect, it, vi } from 'vitest';
import { refreshStudyReport, type ReportRepository, type ReportSnapshot } from './pipeline';

const snapshot: ReportSnapshot = { revision: 4, study: { id: 's1', productName: 'Mira', productUrl: '', goal: 'Find setup problems', audience: '', context: 'A workflow app.', questions: [{ id: 'q', text: 'What blocked you?', followUp: true }] }, calls: [{ interviewId: 'i1', title: 'Participant 01', questions: ['What blocked you?'], conversation: { conversationId: 'c1', status: 'done', durationSecs: 15, turns: [{ role: 'user', text: 'I could not find settings.', timeInCallSecs: 3 }] }, audioUrl: '/audio/i1' }] };
const generateJson = async () => ({ summary: 'Settings were hard to find.', themes: [{ label: 'Navigation', summary: 'One participant could not find settings.', evidence: [{ callId: 'i1', turnId: 'turn-0' }] }], recommendations: [{ text: 'Test a visible settings link.', themeLabels: ['Navigation'] }], questionFindings: [{ questionIndex: 0, status: 'answered', finding: 'Settings could not be found.', themeLabels: ['Navigation'] }] });
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
    repo.load = vi.fn().mockResolvedValueOnce(snapshot).mockResolvedValueOnce({ ...snapshot, revision: 5 });
    await refreshStudyReport('s1', repo, { generateJson });
    expect(repo.load).toHaveBeenCalledTimes(2);
    expect(repo.save).toHaveBeenLastCalledWith('s1', 5, expect.anything());
  });
  it('keeps the last good report on provider failure and records a scoped error', async () => {
    const repo = repository();
    await expect(refreshStudyReport('s1', repo, { generateJson: async () => { throw new Error('Rate limited'); } })).rejects.toThrow('Rate limited');
    expect(repo.save).not.toHaveBeenCalled();
    expect(repo.fail).toHaveBeenCalledWith('s1', 4, 'Rate limited');
  });
});
