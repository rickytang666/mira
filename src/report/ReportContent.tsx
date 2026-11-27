import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Play, Square } from 'lucide-react';
import { Link } from 'react-router';
import type { ReportLoader, ReportQuote, StudyReport } from '../agent/internalTypes';
import { createQuotePlayer, playable, type PlayerState } from './audioPlayer';
import { formatTime } from './formatTime';
import { useReport } from './useReport';
import './report.css';

export interface ReportContentProps {
  studyId?: string;
  /** For Wasp useQuery: pass the latest data here; no second polling loop needed. */
  report?: StudyReport;
  /** For a query adapter: keep this function stable (module scope or useCallback). */
  loadReport?: ReportLoader;
  pollMs?: number;
  actions?: ReactNode;
  beforeContent?: ReactNode;
  emptyAction?: ReactNode;
  emptyMessage?: string;
  /** Needs a router; a quote without a returned link keeps a plain participant label. */
  participantHref?: (quote: ReportQuote) => string | undefined;
}
/** Eases a number from its last shown value to the new one, so live updates read as change, not a jump. */
function EasedNumber({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    if (
      start === value ||
      typeof window === 'undefined' ||
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      from.current = value;
      setShown(value);
      return;
    }
    const began = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - began) / 700);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(start + (value - start) * eased));
      if (t < 1) frame = requestAnimationFrame(step);
      else from.current = value;
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      from.current = value;
    };
  }, [value]);
  return <>{shown}</>;
}

export function ReportContent({
  studyId = '',
  report: provided,
  loadReport,
  pollMs,
  actions,
  beforeContent,
  emptyAction,
  emptyMessage,
  participantHref,
}: ReportContentProps) {
  const live = useReport(studyId, loadReport, pollMs);
  const report = provided ?? live.report;
  const [playerState, setPlayerState] = useState<PlayerState>({ quoteId: null, status: 'idle', error: '' });
  const player = useRef<ReturnType<typeof createQuotePlayer> | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [tab, setTab] = useState<'themes' | 'quotes'>('themes');
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [arrival, setArrival] = useState('');
  const seen = useRef<{ studyId: string; count: number; labels: Set<string> } | null>(null);
  useEffect(() => {
    player.current = createQuotePlayer(setPlayerState);
    return () => {
      player.current?.dispose();
      player.current = null;
    };
  }, []);
  useEffect(() => {
    player.current?.stop();
    setExpanded({});
  }, [report?.studyId]);
  const quotes = report ? [...new Map(report.themes.flatMap((t) => t.quotes).map((q) => [q.id, q])).values()] : [];
  useEffect(() => {
    if (playerState.quoteId && !quotes.some((q) => q.id === playerState.quoteId)) player.current?.stop();
  }, [report, playerState.quoteId]);
  useEffect(() => {
    if (!report) return;
    const labels = new Set(quotes.map((q) => q.participantLabel));
    const previous = seen.current;
    seen.current = { studyId: report.studyId, count: report.completedCount, labels };
    if (!previous || previous.studyId !== report.studyId) return;
    const fresh = [...labels].find((label) => !previous.labels.has(label) && label !== 'Participant quote');
    if (report.completedCount > previous.count)
      setArrival(fresh ? `New interview from ${fresh}` : 'New interview received');
    else if (fresh) setArrival(`New quotes from ${fresh}`);
  }, [report]);
  useEffect(() => {
    if (!arrival) return;
    const timer = setTimeout(() => setArrival(''), 5000);
    return () => clearTimeout(timer);
  }, [arrival]);
  const ranked = report ? [...report.themes].sort((a, b) => b.count - a.count) : [];
  const heroQuote = ranked[0]?.quotes[0];
  function openTheme(id: string) {
    setTab('themes');
    setTimeout(
      () =>
        document
          .getElementById(`finding-${encodeURIComponent(id)}`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      0,
    );
  }
  function renderQuote(quote: (typeof quotes)[number], hero = false) {
    const selected = playerState.quoteId === quote.id;
    const active = selected && playerState.status !== 'idle';
    const enabled = playable(quote);
    const time = quote.startSec === null ? '' : formatTime(quote.startSec);
    const href = participantHref?.(quote);
    return (
      <article className={`fw-quote ${hero ? 'fw-hero-quote' : ''} ${active ? 'is-playing' : ''}`} key={quote.id}>
        <blockquote>“{quote.text}”</blockquote>
        <div className="fw-quote-meta">
          <button
            className="fw-play"
            disabled={!enabled}
            aria-label={`${active ? 'Stop' : 'Play'} quote from ${quote.participantLabel}${quote.startSec !== null ? ` at ${formatTime(quote.startSec)}` : ''}`}
            onClick={() => void player.current?.play(quote)}
          >
            {enabled && (
              <span className="fw-play-icon" aria-hidden="true">
                {active ? (
                  <Square size={9} fill="currentColor" />
                ) : (
                  <Play size={11} fill="currentColor" style={{ marginLeft: 1 }} />
                )}
              </span>
            )}
            {active
              ? playerState.status === 'loading'
                ? 'Loading…'
                : 'Stop'
              : enabled
                ? 'Play'
                : !quote.audioUrl
                  ? 'No recording'
                  : 'No timestamp'}
          </button>
          <span className="fw-quote-sep" aria-hidden="true">
            ·
          </span>
          {href ? (
            <Link
              className="fw-quote-participant"
              to={href}
              aria-label={`Open ${quote.participantLabel}'s transcript at this quote`}
            >
              {quote.participantLabel}
            </Link>
          ) : (
            <span>{quote.participantLabel}</span>
          )}
          {time && (
            <>
              <span className="fw-quote-sep" aria-hidden="true">
                ·
              </span>
              <span className="fw-quote-time">{time}</span>
            </>
          )}
        </div>
        {selected && playerState.error && (
          <p className="fw-error" role="alert">
            {playerState.error}
          </p>
        )}
      </article>
    );
  }
  const statusLabel = (status: string) =>
    status === 'answered' ? 'Answered' : status === 'partial' ? 'Partly answered' : 'Still open';
  return (
    <section className="fw-report" aria-label="Interview research report">
      <header className="fw-report-heading">
        <div>
          <h1>{report?.productName || 'Report'}</h1>
          {report?.goal && <p className="fw-description">{report.goal}</p>}
        </div>
        {actions && <div className="fw-heading-aside">{actions}</div>}
      </header>
      {beforeContent}
      {live.error && (
        <div className="fw-notice" role="alert">
          <span>
            {report ? 'Showing the last successful update. ' : ''}
            {live.error}
          </span>
          <button onClick={live.refresh}>Retry</button>
        </div>
      )}
      {live.loading && !report ? (
        <div className="fw-empty" role="status">
          Loading report…
        </div>
      ) : !report ? (
        <div className="fw-empty">
          <h2>No report yet</h2>
          <p>Themes and quotes appear here after the first interview.</p>
        </div>
      ) : (
        <>
          <dl className="fw-metrics">
            <div>
              <dt>Interviews</dt>
              <dd>
                <EasedNumber value={report.completedCount} />
              </dd>
              {report.processingCount > 0 && <small>{report.processingCount} being analyzed</small>}
            </div>
            <div>
              <dt>Themes</dt>
              <dd>
                <EasedNumber value={report.themes.length} />
              </dd>
            </div>
            <div>
              <dt>Quotes</dt>
              <dd>
                <EasedNumber value={quotes.length} />
              </dd>
            </div>
          </dl>
          <p className={`fw-arrival ${arrival ? 'is-visible' : ''}`} role="status" aria-live="polite">
            {arrival && (
              <>
                <span className="fw-arrival-dot" aria-hidden="true" />
                {arrival}
              </>
            )}
          </p>
          {!!ranked.length && (
            <section className="fw-theme-chart" aria-label="Themes by share of interviews">
              <div className="fw-section-label">
                <h2>Top themes</h2>
                <span>Interviews</span>
              </div>
              <ol>
                {ranked.map((theme, index) => {
                  const share = report.completedCount ? Math.min(100, (theme.count / report.completedCount) * 100) : 0;
                  return (
                    <li key={theme.id}>
                      <button
                        className="fw-chart-row"
                        onClick={() => openTheme(theme.id)}
                        aria-label={`${theme.label}: ${theme.count} of ${report.completedCount} interviews. Jump to theme`}
                      >
                        <span className="fw-chart-rank" aria-hidden="true">
                          {index + 1}
                        </span>
                        <span className="fw-chart-label">{theme.label}</span>
                        <span className="fw-chart-track" aria-hidden="true">
                          <span style={{ width: `${share}%` }} />
                        </span>
                        <span className="fw-chart-count">
                          <b>{theme.count}</b> of {report.completedCount}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </section>
          )}
          {heroQuote && (
            <section className="fw-hero" aria-label="Strongest quote">
              {renderQuote(heroQuote, true)}
            </section>
          )}
          {report.summary && (
            <section className="fw-summary-card" aria-label="Report summary">
              <h2>Summary</h2>
              <p className={summaryOpen ? '' : 'fw-clamp'}>{report.summary}</p>
              {report.summary.length > 160 && (
                <button
                  className="fw-text-button fw-read-more"
                  aria-expanded={summaryOpen}
                  onClick={() => setSummaryOpen((v) => !v)}
                >
                  {summaryOpen ? 'Show less' : 'Read more'}
                </button>
              )}
              <p className="fw-summary-foot">
                Based on {report.synthesizedInterviews ?? report.completedCount}{' '}
                {(report.synthesizedInterviews ?? report.completedCount) === 1 ? 'interview' : 'interviews'}
              </p>
            </section>
          )}
          {report.failedCount > 0 && (
            <p className="fw-notice">
              {report.failedCount} {report.failedCount === 1 ? 'interview' : 'interviews'} could not be analyzed. The
              rest of the report is complete.
            </p>
          )}
          <div className="fw-toolbar">
            <div role="group" aria-label="Report view">
              <button aria-pressed={tab === 'themes'} onClick={() => setTab('themes')}>
                Themes <span>{report.themes.length}</span>
              </button>
              <button aria-pressed={tab === 'quotes'} onClick={() => setTab('quotes')}>
                All quotes <span>{quotes.length}</span>
              </button>
            </div>
            <span className="fw-update">
              {`Updated ${new Date(report.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
            </span>
          </div>
          {!report.themes.length ? (
            <div className="fw-empty">
              <h2>
                {report.processingCount
                  ? 'Analyzing interviews'
                  : report.completedCount
                    ? 'No themes yet'
                    : 'No interviews yet'}
              </h2>
              <p>
                {report.processingCount
                  ? 'This page updates when the findings are ready.'
                  : (emptyMessage ?? 'Share the interview link. Themes and quotes appear here as people finish.')}
              </p>
              {emptyAction && <div className="fw-empty-actions">{emptyAction}</div>}
            </div>
          ) : tab === 'quotes' ? (
            <div className="fw-all-quotes">{quotes.map((q) => renderQuote(q))}</div>
          ) : (
            <div className="fw-themes">
              {ranked.map((theme) => (
                <section className="fw-theme" id={`finding-${encodeURIComponent(theme.id)}`} key={theme.id}>
                  <div className="fw-theme-heading">
                    <div>
                      <h2>{theme.label}</h2>
                      {theme.summary && (
                        <p className="fw-theme-summary" title={theme.summary}>
                          {theme.summary}
                        </p>
                      )}
                    </div>
                    <span className="fw-count">
                      <strong>
                        {theme.count} of {report.completedCount}
                      </strong>{' '}
                      {theme.count === 1 && report.completedCount === 1 ? 'interview' : 'interviews'}
                    </span>
                  </div>
                  <div className="fw-theme-quotes">
                    {(expanded[theme.id] ? theme.quotes : theme.quotes.slice(0, 2)).map((q) => renderQuote(q))}
                  </div>
                  {theme.quotes.length > 2 && (
                    <button
                      className="fw-more"
                      aria-expanded={!!expanded[theme.id]}
                      onClick={() => setExpanded((v) => ({ ...v, [theme.id]: !v[theme.id] }))}
                    >
                      {expanded[theme.id] ? 'Show fewer quotes' : `Show all ${theme.quotes.length} quotes`}
                    </button>
                  )}
                </section>
              ))}
            </div>
          )}
          {!!report.questionFindings?.length && (
            <section className="fw-question-findings" aria-label="Answers to your research questions">
              <h2>By question</h2>
              {report.questionFindings.map((item, index) => (
                <article key={index}>
                  <div>
                    <h3>{item.question}</h3>
                    <p>{item.finding}</p>
                  </div>
                  <span className={`fw-answer-status ${item.status}`}>{statusLabel(item.status)}</span>
                </article>
              ))}
            </section>
          )}
          {!!report.recommendations?.length && (
            <section className="fw-next-card" aria-label="Suggested next steps">
              <h2>Next steps</h2>
              <ol>
                {report.recommendations.map((item, index) => (
                  <li key={index}>
                    <p>{item.text}</p>
                    {!!item.themeIds.length && (
                      <div className="fw-theme-links">
                        {item.themeIds.map((id) => {
                          const theme = report.themes.find((t) => t.id === id);
                          return theme ? (
                            <button
                              key={id}
                              onClick={() => {
                                setTab('themes');
                                setExpanded((v) => ({ ...v, [id]: true }));
                                setTimeout(
                                  () =>
                                    document
                                      .getElementById(`finding-${encodeURIComponent(id)}`)
                                      ?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
                                  0,
                                );
                              }}
                            >
                              {theme.label}
                            </button>
                          ) : null;
                        })}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          )}
          <footer className="fw-report-footer">Counts are distinct interviews, not repeated mentions.</footer>
        </>
      )}
    </section>
  );
}

export default ReportContent;
