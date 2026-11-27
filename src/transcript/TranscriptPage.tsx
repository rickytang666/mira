import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { ArrowLeft, Play, Square } from 'lucide-react';
import { useQuery, getInterview, getStudy } from 'wasp/client/operations';
import { Layout } from '../Layout';
import { createQuotePlayer, playable, type PlayerState } from '../report/audioPlayer';
import { formatTime } from '../report/ReportContent';
import { lineAsQuote, parseAt, turnAt, type InterviewView } from './turns';
import '../report/report.css';
import './transcript.css';

export function TranscriptPage() {
  const { studyId = '', interviewId = '' } = useParams();
  const { search } = useLocation();
  const { data: view, error, refetch } = useQuery(getInterview, { studyId, interviewId });
  const { data: study } = useQuery(getStudy, { studyId });
  return (
    <Layout page="report" sourceCount={study?.sources.length ?? 0} questionCount={study?.questions.length ?? 0}>
      <section className="fw-report fw-transcript" aria-label="Interview transcript">
        <Link className="fw-text-button fw-back" to={`/study/${studyId}/report`}>
          <ArrowLeft size={14} aria-hidden="true" /> Back to report
        </Link>
        {error ? (
          <div className="fw-notice" role="alert">
            Could not load this interview.{' '}
            <button type="button" onClick={() => void refetch()}>
              Retry
            </button>
          </div>
        ) : !view ? (
          <div className="fw-empty" role="status">
            Loading transcript…
          </div>
        ) : (
          <Transcript view={view} highlightAt={parseAt(search)} />
        )}
      </section>
    </Layout>
  );
}

function Transcript({ view, highlightAt }: { view: InterviewView; highlightAt: number | null }) {
  const [playerState, setPlayerState] = useState<PlayerState>({ quoteId: null, status: 'idle', error: '' });
  const player = useRef<ReturnType<typeof createQuotePlayer> | null>(null);
  const highlighted = turnAt(view.turns, highlightAt);
  const highlightId = view.turns[highlighted]?.id;
  useEffect(() => {
    player.current = createQuotePlayer(setPlayerState);
    return () => {
      player.current?.dispose();
      player.current = null;
    };
  }, []);
  useEffect(() => {
    if (highlightId) document.getElementById(highlightId)?.scrollIntoView({ block: 'center' });
  }, [highlightId]);
  const date = new Date(view.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  return (
    <>
      <header className="fw-report-heading">
        <div>
          <h1>{view.participantLabel}</h1>
          <p className="fw-description">
            {view.productName} · {date}
            {view.durationSecs ? ` · ${formatTime(view.durationSecs)}` : ''}
          </p>
        </div>
      </header>
      {!!view.questions.length && (
        <details className="fw-transcript-questions">
          <summary>Questions for this interview ({view.questions.length})</summary>
          <ol>
            {view.questions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ol>
        </details>
      )}
      {!view.turns.length ? (
        <div className="fw-empty">
          <h2>{view.status === 'failed' ? 'Transcript unavailable' : 'No transcript yet'}</h2>
          <p>
            {view.status === 'failed'
              ? 'This call could not be fetched.'
              : 'The transcript appears here once the call is processed.'}
          </p>
        </div>
      ) : (
        <ol className="fw-turns">
          {view.turns.map((line, index) => {
            const quote = lineAsQuote(line, view);
            const enabled = playable(quote);
            const active = playerState.quoteId === line.id && playerState.status !== 'idle';
            const speaker = line.speaker === 'mira' ? 'Mira' : 'Participant';
            const time = line.startSec === null ? '' : formatTime(line.startSec);
            return (
              <li
                key={line.id}
                id={line.id}
                className={`fw-turn is-${line.speaker} ${index === highlighted ? 'is-highlighted' : ''} ${active ? 'is-playing' : ''}`}
              >
                <button
                  type="button"
                  className="fw-turn-button"
                  disabled={!enabled}
                  aria-label={`${active ? 'Stop' : 'Play'} ${speaker}${time ? ` at ${time}` : ''}`}
                  onClick={() => void player.current?.play(quote)}
                >
                  <span className="fw-turn-meta">
                    {enabled && (
                      <span className="fw-play-icon" aria-hidden="true">
                        {active ? (
                          <Square size={9} fill="currentColor" />
                        ) : (
                          <Play size={11} fill="currentColor" style={{ marginLeft: 1 }} />
                        )}
                      </span>
                    )}
                    <span className="fw-turn-speaker">{speaker}</span>
                    {time && <span className="fw-quote-time">{time}</span>}
                    {active && playerState.status === 'loading' && <span>Loading…</span>}
                  </span>
                  <span className="fw-turn-text">{line.text}</span>
                </button>
                {playerState.quoteId === line.id && playerState.error && (
                  <p className="fw-error" role="alert">
                    {playerState.error}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}
