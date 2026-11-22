import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ReportLoader, StudyReport } from '../agent/internalTypes';
import { createQuotePlayer, playable, type PlayerState } from './audioPlayer';
import { useReport } from './useReport';
import './report.css';

export interface ReportContentProps {
  studyId?: string;
  /** For Wasp useQuery: pass the latest data here; no second polling loop needed. */
  report?: StudyReport;
  /** For a query adapter: keep this function stable (module scope or useCallback). */
  loadReport?: ReportLoader;
  pollMs?: number;
  sample?: boolean;
  actions?: ReactNode;
  beforeContent?: ReactNode;
  emptyAction?: ReactNode;
  emptyMessage?: string;
}
export const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export function ReportContent({ studyId = '', report: provided, loadReport, pollMs, sample = false, actions, beforeContent, emptyAction, emptyMessage }: ReportContentProps) {
  const live = useReport(studyId, loadReport, pollMs);
  const report = provided ?? live.report;
  const [playerState, setPlayerState] = useState<PlayerState>({ quoteId: null, status: 'idle', error: '' });
  const player = useRef<ReturnType<typeof createQuotePlayer> | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [tab, setTab] = useState<'themes' | 'quotes'>('themes');
  useEffect(() => {
    player.current = createQuotePlayer(setPlayerState);
    return () => { player.current?.dispose(); player.current = null; };
  }, []);
  useEffect(() => { player.current?.stop(); setExpanded({}); }, [report?.studyId]);
  const quotes = report ? [...new Map(report.themes.flatMap(t => t.quotes).map(q => [q.id, q])).values()] : [];
  useEffect(() => {
    if (playerState.quoteId && !quotes.some(q => q.id === playerState.quoteId)) player.current?.stop();
  }, [report, playerState.quoteId]);
  function renderQuote(quote: typeof quotes[number]) {
    const selected = playerState.quoteId === quote.id;
    const active = selected && playerState.status !== 'idle';
    const enabled = playable(quote);
    return <article className={`fw-quote ${active ? 'is-playing' : ''}`} key={quote.id}>
      <blockquote>“{quote.text}”</blockquote>
      <div className="fw-quote-meta"><span>{quote.participantLabel}</span><span className="fw-quote-time">{quote.startSec === null ? 'No timestamp' : formatTime(quote.startSec)}</span>
        <button className="fw-play" disabled={!enabled} aria-label={`${active ? 'Stop' : 'Play'} quote from ${quote.participantLabel}${quote.startSec !== null ? ` at ${formatTime(quote.startSec)}` : ''}`} onClick={() => void player.current?.play(quote)}>
          <span aria-hidden="true">{active ? '■' : '▶'}</span>{active ? (playerState.status === 'loading' ? 'Loading…' : 'Stop') : enabled ? 'Listen' : !quote.audioUrl ? 'No recording' : 'Untimed'}
        </button>
      </div>
      {selected && playerState.error && <p className="fw-error" role="alert">{playerState.error}</p>}
    </article>;
  }
  return <section className="fw-report" aria-label="Interview research report">
    <header className="fw-report-heading"><div><p className="fw-eyebrow">03 / THE LEARNING</p><h1>Their words.<br/>Your next move.</h1><p className="fw-description">{report?.goal || 'A home for the patterns, surprises, and stories from your users.'}</p></div>
      <div className="fw-heading-aside">{actions}<div className="fw-study-badge"><span className="fw-status-dot"/>{sample ? 'Sample report' : report?.productName || 'Research report'}<small>{sample ? 'Illustrative data · not real interviews' : loadReport ? 'Updates automatically' : 'Interview evidence'}</small></div></div>
    </header>
    {beforeContent}
    {live.error && <div className="fw-notice" role="alert"><span>{report ? 'Showing the last successful update. ' : ''}{live.error}</span><button onClick={live.refresh}>Retry now</button></div>}
    {live.loading && !report ? <div className="fw-empty" role="status">Loading interview evidence…</div> : !report ? <div className="fw-empty"><h2>Your first conversation belongs here.</h2><p>Connect this study’s report to see interview themes and recordings.</p></div> : <>
      <div className="fw-metrics">
        <div><span>Completed interviews</span><strong>{report.completedCount}</strong><small>{report.processingCount ? `${report.processingCount} being analyzed` : 'Every conversation counts'}</small></div>
        <div><span>Emerging themes</span><strong>{report.themes.length}</strong><small>Grounded in participant responses</small></div>
        <div><span>Supporting quotes</span><strong>{quotes.length}</strong><small>The evidence behind the findings</small></div>
      </div>
      {(report.summary || !!report.recommendations?.length) && <div className="fw-overview-grid">
        {report.summary && <section className="fw-summary-card" aria-label="Report summary"><div className="fw-summary-label"><span aria-hidden="true">✳</span> THE SHORT VERSION</div><h2>What we heard.</h2><p>{report.summary}</p><div className="fw-summary-foot"><span className="fw-summary-line"/><span>Based on {report.synthesizedInterviews ?? report.completedCount} {(report.synthesizedInterviews ?? report.completedCount) === 1 ? 'conversation' : 'conversations'}</span></div></section>}
        {!!report.recommendations?.length && <section className="fw-next-card" aria-label="Suggested next steps"><p className="fw-eyebrow">FROM INSIGHT TO ACTION</p><h2>What to explore next</h2><ol>{report.recommendations.map((item, index) => <li key={index}><span className="fw-next-number">0{index + 1}</span><div><p>{item.text}</p><div className="fw-theme-links">{item.themeIds.map(id => { const theme = report.themes.find(t => t.id === id); return theme ? <button key={id} onClick={() => { setTab('themes'); setExpanded(v => ({ ...v, [id]: true })); setTimeout(() => document.getElementById(`finding-${encodeURIComponent(id)}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0); }}>{theme.label} <span aria-hidden="true">↗</span></button> : null; })}</div></div></li>)}</ol><small>Suggestions to test, grounded in the themes below.</small></section>}
      </div>}
      {!!report.questionFindings?.length && <section className="fw-question-findings" aria-label="Answers to your research questions"><p className="fw-eyebrow">BACK TO YOUR QUESTIONS</p><h2>What we learned. What is still open.</h2>{report.questionFindings.map((item, index) => <article key={index}><span className="fw-next-number">{String(index + 1).padStart(2, '0')}</span><div><h3>{item.question}</h3><p>{item.finding}</p></div><span className={`fw-answer-status ${item.status}`}>{item.status === 'answered' ? 'Evidence found' : item.status === 'partial' ? 'Partly answered' : 'Still open'}</span></article>)}</section>}
      {report.failedCount > 0 && <p className="fw-notice">{report.failedCount} {report.failedCount === 1 ? 'interview needs' : 'interviews need'} processing attention. Completed findings remain available.</p>}
      <div className="fw-toolbar"><div role="group" aria-label="Report view"><button aria-pressed={tab === 'themes'} onClick={() => setTab('themes')}>Key themes <span>{report.themes.length}</span></button><button aria-pressed={tab === 'quotes'} onClick={() => setTab('quotes')}>All quotes <span>{quotes.length}</span></button></div><span className="fw-update">{sample ? 'Preview' : `Updated ${new Date(report.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}</span></div>
      {!report.themes.length ? <div className="fw-empty"><span className="fw-empty-icon" aria-hidden="true">“</span><h2>{report.processingCount ? 'Listening is done. Learning is next.' : report.completedCount ? 'No supported themes yet.' : 'The best insights are still ahead.'}</h2><p>{report.processingCount ? 'Interviews are being analyzed. This report will update when findings are ready.' : (emptyMessage ?? 'After interviews finish, this report brings together the answers, emerging themes, and evidence behind your next decisions.')}</p>{emptyAction && <div className="fw-empty-actions">{emptyAction}</div>}</div> : tab === 'quotes' ? <div className="fw-all-quotes">{quotes.map(renderQuote)}</div> : <div className="fw-themes">{report.themes.map((theme, index) => <section className="fw-theme" id={`finding-${encodeURIComponent(theme.id)}`} key={theme.id}>
        <div className="fw-theme-heading"><span className="fw-theme-index">{String(index + 1).padStart(2, '0')}</span><div><h2>{theme.label}</h2>{theme.summary && <p>{theme.summary}</p>}</div><span className="fw-count">{theme.count} of {report.completedCount}<small>{theme.count === 1 ? 'interview' : 'interviews'}</small></span></div>
        <div className="fw-evidence-bar" aria-hidden="true"><span style={{ width: `${report.completedCount ? Math.min(100, theme.count / report.completedCount * 100) : 0}%` }}/></div>
        <div className="fw-theme-quotes">{(expanded[theme.id] ? theme.quotes : theme.quotes.slice(0, 2)).map(renderQuote)}</div>
        {theme.quotes.length > 2 && <button className="fw-more" aria-expanded={!!expanded[theme.id]} onClick={() => setExpanded(v => ({ ...v, [theme.id]: !v[theme.id] }))}>{expanded[theme.id] ? 'Show fewer quotes' : `Show all ${theme.quotes.length} quotes`} <span aria-hidden="true">↗</span></button>}
      </section>)}</div>}
      <footer className="fw-report-footer">Counts show distinct interviews, not repeated mentions.<span>{sample ? 'Sample evidence for layout testing.' : 'Listen closely. Build thoughtfully.'}</span></footer>
    </>}
  </section>;
}

export default ReportContent;
