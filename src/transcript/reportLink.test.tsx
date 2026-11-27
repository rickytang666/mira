import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { ReportContent } from '../report/ReportContent';
import { fromReportView } from '../report/fromReportView';
import { transcriptHref } from './turns';

const report = fromReportView({
  studyId: 's1',
  goal: 'Learn',
  interviewsDone: 1,
  interviewsProcessing: 0,
  themes: [
    {
      id: 't',
      label: 'Setup',
      count: 1,
      quotes: [
        {
          id: 'q',
          text: 'I got stuck.',
          startSec: 4.5,
          endSec: 12,
          interviewId: 'i1',
          participantLabel: 'Participant 01',
          audioUrl: '/a',
        },
      ],
    },
  ],
});

describe('report participant label', () => {
  it('links to the transcript at the quoted turn', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <ReportContent
          report={report}
          participantHref={(q) => (q.interviewId ? transcriptHref('s1', q.interviewId, q.startSec) : undefined)}
        />
      </MemoryRouter>,
    );
    expect(html).toContain('href="/study/s1/interviews/i1?at=4.5"');
    expect(html).toContain('>Participant 01</a>');
  });
  it('stays a plain label without a link builder', () => {
    const html = renderToStaticMarkup(<ReportContent report={report} />);
    expect(html).not.toContain('/interviews/');
    expect(html).toContain('<span>Participant 01</span>');
  });
});
