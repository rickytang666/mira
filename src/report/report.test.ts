import { describe, expect, it, vi } from 'vitest';
import { buildReport } from './buildReport';
import { sampleInterviews, sampleReport, sampleStudy } from './fixtures';
import { createQuotePlayer } from './audioPlayer';
import { fromReportView } from './fromReportView';

describe('report aggregation', () => {
  it('accepts the published ReportView without inventing missing quote metadata', () => {
    const report = fromReportView({ studyId: 'study-1', goal: 'Learn', interviewsDone: 2, interviewsProcessing: 1, themes: [{ id: 'theme-1', label: 'Setup', count: 2, quotes: [{ id: 'q1', text: 'It was confusing.', startSec: 8, audioUrl: '/audio/one' }] }] });
    expect(report.completedCount).toBe(2);
    expect(report.processingCount).toBe(1);
    expect(report.themes[0].quotes[0]).toMatchObject({ startSec: 8, endSec: null, audioUrl: '/audio/one', participantLabel: 'Participant quote' });
  });
  it('counts interviews, not quotes, including repeated processing results', () => {
    const duplicatedTheme = { ...sampleInterviews[0], synthesis: { ...sampleInterviews[0].synthesis!, themes: [sampleInterviews[0].synthesis!.themes[0], sampleInterviews[0].synthesis!.themes[0]] } };
    const report = buildReport(sampleStudy, [duplicatedTheme, duplicatedTheme, ...sampleInterviews.slice(1), { id: 'pending', status: 'processing' }, { id: 'bad', status: 'failed' }]);
    expect(report.completedCount).toBe(3);
    expect(report.processingCount).toBe(1);
    expect(report.failedCount).toBe(1);
    expect(report.themes[0].count).toBe(3);
    expect(report.themes[0].quotes).toHaveLength(3);
  });
  it('does not include findings from incomplete interviews', () => {
    expect(buildReport(sampleStudy, [{ ...sampleInterviews[0], status: 'processing' }]).themes).toEqual([]);
  });
});

class MockAudio {
  src = ''; currentTime = 0; duration = 60; preload = '';
  onloadedmetadata: (() => void) | null = null;
  oncanplay: (() => void) | null = null;
  ontimeupdate: (() => void) | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  play = vi.fn(async () => { this.onloadedmetadata?.(); });
  pause = vi.fn(); load = vi.fn(); removeAttribute = vi.fn();
}
const quote = { ...sampleReport.themes[0].quotes[0], audioUrl: '/audio/interview-1', startSec: 5, endSec: 14 };
describe('quote playback', () => {
  it('starts at the quote offset and stops at the quote end', async () => {
    const audio = new MockAudio();
    const player = createQuotePlayer(vi.fn(), () => audio as unknown as HTMLAudioElement);
    await player.play(quote);
    expect(audio.currentTime).toBe(5);
    expect(player.getState().status).toBe('playing');
    audio.currentTime = 14.1; audio.ontimeupdate?.();
    expect(audio.pause).toHaveBeenCalled();
    expect(player.getState().status).toBe('idle');
  });
  it('blocks untimed quotes and reports rejected playback', async () => {
    const audio = new MockAudio(); audio.play.mockRejectedValue(new Error('blocked'));
    const player = createQuotePlayer(vi.fn(), () => audio as unknown as HTMLAudioElement);
    await player.play({ ...quote, startSec: null }); expect(audio.play).not.toHaveBeenCalled();
    await player.play(quote); expect(player.getState().error).toContain('blocked');
  });
  it('does not let an old play promise overwrite a newer selection', async () => {
    const first = new MockAudio(), second = new MockAudio();
    let resolve!: () => void;
    first.play.mockImplementation(() => new Promise<void>(r => { resolve = r; }));
    const queue = [first, second];
    const player = createQuotePlayer(vi.fn(), () => queue.shift()! as unknown as HTMLAudioElement);
    const pending = player.play(quote);
    await player.play({ ...quote, id: 'second', startSec: 20, endSec: 30 });
    resolve(); await pending;
    expect(player.getState()).toMatchObject({ quoteId: 'second', status: 'playing' });
    expect(second.currentTime).toBe(20);
    expect(first.pause).toHaveBeenCalled();
  });
  it('stops when the current quote is clicked again and rejects offsets beyond duration', async () => {
    const audio = new MockAudio();
    const player = createQuotePlayer(vi.fn(), () => audio as unknown as HTMLAudioElement);
    await player.play(quote); await player.play(quote);
    expect(player.getState().status).toBe('idle');
    await player.play({ ...quote, startSec: 90, endSec: 95 });
    expect(player.getState().error).toContain('beyond');
  });
});
