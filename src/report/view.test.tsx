import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ConnectedReport } from './ConnectedReport';
import { sampleReportView } from './fixtures';

describe('report rendering from the team contract', () => {
  it('renders evidence and counts without requiring browser-only globals', () => {
    const html = renderToStaticMarkup(<ConnectedReport studyId={sampleReportView.studyId} report={sampleReportView}/>);
    expect(html).toContain('Setup needs a clearer next step');
    expect(html).toContain('3 of 3');
    expect(html).toContain('I got stuck connecting my API key.');
    expect(html).toContain('Participant 01');
    expect(html).toContain('Summary');
    expect(html).toContain('Next steps');
    expect(html).toMatch(/button[^>]+disabled=""[^>]+aria-label="Play quote/);
  });
  it('shows pending analysis instead of sample findings for a real empty report', () => {
    const html = renderToStaticMarkup(<ConnectedReport studyId="new" report={{ studyId: 'new', goal: 'Learn', interviewsDone: 0, interviewsProcessing: 1, themes: [] }}/>);
    expect(html).toContain('Analyzing interviews');
    expect(html).toContain('This page updates when the findings are ready.');
    expect(html).not.toContain('Setup needs a clearer next step');
  });
  it('makes a timestamped recording playable', () => {
    const html = renderToStaticMarkup(<ConnectedReport studyId="one" report={{ studyId: 'one', goal: 'Learn', interviewsDone: 1, interviewsProcessing: 0, themes: [{ id: 't', label: 'Setup', count: 1, quotes: [{ id: 'q', text: 'I got stuck.', startSec: 12, audioUrl: '/recording/one' }] }] }}/>);
    expect(html).toContain('Play quote from Participant quote at 0:12');
    expect(html).toMatch(/<button class="fw-play" aria-label="Play quote[^"]*">.*?Play<\/button>/);
    expect(html).not.toContain('disabled=""');
  });
});
