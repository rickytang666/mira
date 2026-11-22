import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { ConversationProvider, useConversation } from '@elevenlabs/react';
import { QRCodeSVG } from 'qrcode.react';
import { Mic, MicOff, PhoneOff, RotateCcw, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { useQuery, getPublicStudy } from 'wasp/client/operations';
import type { PublicStudy } from '../contract';
import { reportFinished } from './finished';
import { VoiceOrb } from './VoiceOrb';
import './interview.css';

const AGENT_ID = (import.meta.env.REACT_APP_ELEVENLABS_AGENT_ID as string | undefined) ?? '';
// The knowledge base can be 40k characters; a voice turn re-reads the whole prompt, so keep it short for latency.
const MAX_SPOKEN_CONTEXT = 8000;

type Phase = 'ready' | 'connecting' | 'live' | 'done' | 'error';
type Line = { role: 'user' | 'agent'; text: string };

/** Contract variables from getPublicStudy, plus product_name so the agent can say the product's name. */
function sessionVariables(study: PublicStudy): Record<string, string> {
  const base = study.dynamicVariables ?? {
    product_url: study.productUrl,
    goal: study.goal,
    study_id: study.id,
    questions: study.questions.map((q, i) => `${i + 1}. ${q}`).join('\n'),
  };
  const vars: Record<string, string> = { product_name: study.name || 'this product', audience: '', product_context: '' };
  for (const [k, v] of Object.entries(base)) if (typeof v === 'string') vars[k] = v;
  vars.product_context = vars.product_context.slice(0, MAX_SPOKEN_CONTEXT);
  if (!vars.audience) vars.audience = 'someone who has used this product';
  return vars;
}

export function InterviewPage() {
  const { studyId = '' } = useParams();
  const { data: study, error, isLoading } = useQuery(getPublicStudy, { studyId });
  const [muted, setMuted] = useState(false);

  if (isLoading) return <Shell><div className="iv-notice"><Loader2 className="iv-spin" size={22} /><p>Loading your interview…</p></div></Shell>;
  if (error || !study) return <Shell><Notice title="This interview link isn't valid." body="Ask whoever shared it for a fresh link or QR code." /></Shell>;
  if (!study.questions.length) return <Shell><Notice title="This study has no questions yet." body="The team needs to add interview questions before it can start." /></Shell>;
  if (!AGENT_ID) return <Shell><Notice title="Voice interviewer not configured." body="Set REACT_APP_ELEVENLABS_AGENT_ID in .env.client and restart the app." /></Shell>;

  return (
    <ConversationProvider agentId={AGENT_ID} isMuted={muted} onMutedChange={setMuted}>
      <Interview study={study} muted={muted} setMuted={setMuted} />
    </ConversationProvider>
  );
}

function Interview({ study, muted, setMuted }: { study: PublicStudy; muted: boolean; setMuted: (m: boolean) => void }) {
  const [phase, setPhase] = useState<Phase>('ready');
  const [error, setError] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const conversationId = useRef('');
  const questionSnapshot = useRef<string[]>([]);
  const finished = useRef(false);

  const finish = useCallback(() => {
    if (finished.current || !conversationId.current) return;
    finished.current = true;
    void reportFinished({ studyId: study.id, conversationId: conversationId.current, questionSnapshot: questionSnapshot.current });
  }, [study.id]);

  const conversation = useConversation({
    onConnect: ({ conversationId: id }) => { conversationId.current = id; setPhase('live'); },
    onDisconnect: details => {
      finish();
      if (details.reason === 'error') { setError(details.message || 'The connection dropped.'); setPhase(conversationId.current ? 'done' : 'error'); }
      else setPhase('done');
    },
    onError: message => setError(message),
    // Expressive mode puts audio tags like "[Warmly]" in the text; they are for the voice, not the screen.
    onMessage: ({ role, message }) => {
      const text = message.replace(/\[[^\]]*\]\s*/g, '').trim();
      if (text) setLines(prev => [...prev.slice(-1), { role, text }]);
    },
  });

  // If the participant closes the tab mid-interview, still hand the conversation to the server.
  useEffect(() => {
    window.addEventListener('pagehide', finish);
    return () => window.removeEventListener('pagehide', finish);
  }, [finish]);

  async function start() {
    setError('');
    setLines([]);
    finished.current = false;
    conversationId.current = '';
    questionSnapshot.current = study.questions;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
    } catch {
      setError('Microphone access is blocked. Allow it in your browser settings, then try again.');
      setPhase('error');
      return;
    }
    setPhase('connecting');
    conversation.startSession({ connectionType: 'webrtc', dynamicVariables: sessionVariables(study) });
  }

  const live = phase === 'live';
  const caption = lines[lines.length - 1];
  const productName = study.name || 'this product';

  return (
    <Shell productName={productName}>
      <div className="iv-stage">
        <VoiceOrb speaking={live && conversation.isSpeaking} live={live} />
        <p className="iv-status" role="status">
          {phase === 'ready' && 'About a minute. Just talk normally.'}
          {phase === 'connecting' && 'Connecting…'}
          {live && (muted ? 'Muted. Tap the mic when you want to talk.' : conversation.isSpeaking ? 'Speaking…' : 'Listening…')}
          {phase === 'done' && 'Thanks for your time!'}
          {phase === 'error' && 'Something went wrong.'}
        </p>
        {live && caption && <p className={`iv-caption ${caption.role}`}>{caption.text}</p>}
      </div>

      {error && <div className="iv-error"><AlertCircle size={16} />{error}</div>}

      <div className="iv-actions">
        {(phase === 'ready' || phase === 'error') && (
          <button className="iv-start" onClick={start}><Mic size={20} />{phase === 'error' ? 'Try again' : 'Start interview'}</button>
        )}
        {phase === 'connecting' && <button className="iv-start" disabled>Connecting…</button>}
        {live && (
          <>
            <button className={`iv-round ${muted ? 'off' : ''}`} onClick={() => setMuted(!muted)} aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}>
              {muted ? <MicOff size={22} /> : <Mic size={22} />}
            </button>
            <button className="iv-round end" onClick={() => conversation.endSession()} aria-label="End interview"><PhoneOff size={22} /></button>
          </>
        )}
        {phase === 'done' && (
          <div className="iv-done">
            <CheckCircle2 size={22} />
            <p>Your answers are with the {productName} team.</p>
            <button className="iv-link" onClick={() => setPhase('ready')}><RotateCcw size={14} />Start over</button>
          </div>
        )}
      </div>

      <p className="iv-fine">Your voice is recorded and shared with the team that made this study. No sign-up, no other personal data.</p>
    </Shell>
  );
}

function Shell({ productName, children }: { productName?: string; children: React.ReactNode }) {
  return (
    <div className="iv-page">
      <main className="iv-card">
        <div className="iv-brand"><span className="iv-mark">F</span>Fieldwork</div>
        {productName && (
          <header className="iv-head">
            <div className="iv-eyebrow">A SHORT VOICE INTERVIEW</div>
            <h1>Help shape {productName}</h1>
          </header>
        )}
        {children}
      </main>
      {productName && (
        <aside className="iv-share">
          <a className="study-qr" href={window.location.href} aria-label="Interview link QR code">
            <QRCodeSVG value={window.location.href} size={196} level="M" marginSize={2} fgColor="#263e2e" bgColor="#ffffff" />
          </a>
          <p><strong>Scan to start on your phone</strong>About a minute, no sign-up.</p>
        </aside>
      )}
    </div>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return <div className="iv-notice"><AlertCircle size={22} /><h1>{title}</h1><p>{body}</p></div>;
}
