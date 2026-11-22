import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Play, Square } from 'lucide-react';
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
    const time = quote.startSec === null ? '' : formatTime(quote.startSec);
    return <article className={`fw-quote ${active ? 'is-playing' : ''}`} key={quote.id}>
      <blockquote>“{quote.text}”</blockquote>
      <div className="fw-quote-meta">
        <button className="fw-play" disabled={!enabled} aria-label={`${active ? 'Stop' : 'Play'} quote from ${quote.participantLabel}${quote.startSec !== null ? ` at ${formatTime(quote.startSec)}` : ''}`} onClick={() => void player.current?.play(quote)}>
          {enabled && (active ? <Square size={12} fill="currentColor" aria-hidden="true"/> : <Play size={13} fill="currentColor" aria-hidden="true"/>)}{active ? (playerState.status === 'loading' ? 'Loading…' : 'Stop') : enabled ? 'Listen' : !quote.audioUrl ? 'No recording' : 'No timestamp'}
        </button>
        <span>{quote.participantLabel}{time && <span className="fw-quote-time"> at {time}</span>}</span>
      </div>
      {selected && playerState.error && <p className="fw-error" role="alert">{playerState.error}</p>}
    </article>;
  }
  const statusLabel = (status: string) => status === 'answered' ? 'Answered' : status === 'partial' ? 'Partly answered' : 'Still open';
  return <section className="fw-report" aria-label="Interview research report">
    <header className="fw-report-heading">
      <div><h1>{sample ? 'Sample report' : report?.productName || 'Report'}</h1>{report?.goal && <p className="fw-description">{report.goal}</p>}{sample && <p className="fw-description">Illustrative data, not real interviews.</p>}</div>
      {actions && <div className="fw-heading-aside">{actions}</div>}
    </header>
    {beforeContent}
    {live.error && <div className="fw-notice" role="alert"><span>{report ? 'Showing the last successful update. ' : ''}{live.error}</span><button onClick={live.refresh}>Retry</button></div>}
    {live.loading && !report ? <div className="fw-empty" role="status">Loading report…</div> : !report ? <div className="fw-empty"><h2>No report yet</h2><p>Themes and quotes appear here after the first interview.</p></div> : <>
      <dl className="fw-metrics">
        <div><dt>Interviews</dt><dd>{report.completedCount}</dd>{report.processingCount > 0 && <small>{report.processingCount} being analyzed</small>}</div>
        <div><dt>Themes</dt><dd>{report.themes.length}</dd></div>
        <div><dt>Quotes</dt><dd>{quotes.length}</dd></div>
      </dl>
      {(report.summary || !!report.recommendations?.length) && <div className="fw-overview-grid">
        {report.summary && <section className="fw-summary-card" aria-label="Report summary"><h2>Summary</h2><p>{report.summary}</p><p className="fw-summary-foot">Based on {report.synthesizedInterviews ?? report.completedCount} {(report.synthesizedInterviews ?? report.completedCount) === 1 ? 'interview' : 'interviews'}</p></section>}
        {!!report.recommendations?.length && <section className="fw-next-card" aria-label="Suggested next steps"><h2>Next steps</h2><ul>{report.recommendations.map((item, index) => <li key={index}><p>{item.text}</p>{!!item.themeIds.length && <div className="fw-theme-links">{item.themeIds.map(id => { const theme = report.themes.find(t => t.id === id); return theme ? <button key={id} onClick={() => { setTab('themes'); setExpanded(v => ({ ...v, [id]: true })); setTimeout(() => document.getElementById(`finding-${encodeURIComponent(id)}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0); }}>{theme.label}</button> : null; })}</div>}</li>)}</ul></section>}
      </div>}
      {report.failedCount > 0 && <p className="fw-notice">{report.failedCount} {report.failedCount === 1 ? 'interview' : 'interviews'} could not be analyzed. The rest of the report is complete.</p>}
      <div className="fw-toolbar"><div role="group" aria-label="Report view"><button aria-pressed={tab === 'themes'} onClick={() => setTab('themes')}>Themes <span>{report.themes.length}</span></button><button aria-pressed={tab === 'quotes'} onClick={() => setTab('quotes')}>All quotes <span>{quotes.length}</span></button></div><span className="fw-update">{sample ? 'Preview' : `Updated ${new Date(report.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}</span></div>
      {!report.themes.length ? <div className="fw-empty"><h2>{report.processingCount ? 'Analyzing interviews' : report.completedCount ? 'No themes yet' : 'No interviews yet'}</h2><p>{report.processingCount ? 'This page updates when the findings are ready.' : (emptyMessage ?? 'Share the interview link. Themes and quotes appear here as people finish.')}</p>{emptyAction && <div className="fw-empty-actions">{emptyAction}</div>}</div> : tab === 'quotes' ? <div className="fw-all-quotes">{quotes.map(renderQuote)}</div> : <div className="fw-themes">{report.themes.map(theme => <section className="fw-theme" id={`finding-${encodeURIComponent(theme.id)}`} key={theme.id}>
        <div className="fw-theme-heading"><div><h2>{theme.label}</h2>{theme.summary && <p>{theme.summary}</p>}</div><span className="fw-count"><strong>{theme.count} of {report.completedCount}</strong> {theme.count === 1 && report.completedCount === 1 ? 'interview' : 'interviews'}</span></div>
        <div className="fw-evidence-bar" aria-hidden="true"><span style={{ width: `${report.completedCount ? Math.min(100, theme.count / report.completedCount * 100) : 0}%` }}/></div>
        <div className="fw-theme-quotes">{(expanded[theme.id] ? theme.quotes : theme.quotes.slice(0, 2)).map(renderQuote)}</div>
        {theme.quotes.length > 2 && <button className="fw-more" aria-expanded={!!expanded[theme.id]} onClick={() => setExpanded(v => ({ ...v, [theme.id]: !v[theme.id] }))}>{expanded[theme.id] ? 'Show fewer quotes' : `Show all ${theme.quotes.length} quotes`}</button>}
      </section>)}</div>}
      {!!report.questionFindings?.length && <section className="fw-question-findings" aria-label="Answers to your research questions"><h2>By question</h2>{report.questionFindings.map((item, index) => <article key={index}><div><h3>{item.question}</h3><p>{item.finding}</p></div><span className={`fw-answer-status ${item.status}`}>{statusLabel(item.status)}</span></article>)}</section>}
      <footer className="fw-report-footer">Counts are distinct interviews, not repeated mentions.</footer>
    </>}
  </section>;
}

export default ReportContent;
