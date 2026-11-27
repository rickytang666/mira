import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { ConversationProvider, useConversation } from '@elevenlabs/react';
import { Mic, MicOff, PhoneOff, RotateCcw, AlertCircle, Check, Loader2 } from 'lucide-react';
import { useQuery, getPublicStudy } from 'wasp/client/operations';
import type { PublicStudy } from '../contract';
import { reportFinished } from './finished';
import { CharacterCanvas } from '../character/CharacterCanvas';
import '../Main.css';
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
  // Mic is closed while Mira talks: phone speakers echo her voice back and hall noise cut her off mid-question.
  const [agentTalking, setAgentTalking] = useState(false);

  if (isLoading) return <Shell><div className="iv-notice"><Loader2 className="iv-spin" size={22} /><p>Loading your interview…</p></div></Shell>;
  if (error || !study) return <Shell><Notice title="This interview link isn't valid." body="Ask whoever shared it for a fresh link or QR code." /></Shell>;
  if (!study.questions.length) return <Shell><Notice title="This study has no questions yet." body="The team needs to add interview questions before it can start." /></Shell>;
  if (!AGENT_ID) return <Shell><Notice title="Voice interviewer not configured." body="Set REACT_APP_ELEVENLABS_AGENT_ID in .env.client and restart the app." /></Shell>;

  return (
    <ConversationProvider agentId={AGENT_ID} isMuted={muted || agentTalking}>
      <Interview study={study} muted={muted} setMuted={setMuted} onAgentTalking={setAgentTalking} />
    </ConversationProvider>
  );
}

function Interview({ study, muted, setMuted, onAgentTalking }: { study: PublicStudy; muted: boolean; setMuted: (m: boolean) => void; onAgentTalking: (talking: boolean) => void }) {
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
      for (const t of stream.getTracks()) t.stop();
    } catch {
      setError('Microphone access is blocked. Allow it in your browser settings, then try again.');
      setPhase('error');
      return;
    }
    setPhase('connecting');
    conversation.startSession({ connectionType: 'webrtc', dynamicVariables: sessionVariables(study) });
  }

  const live = phase === 'live';
  const speaking = live && conversation.isSpeaking;
  // Reopen the mic a beat after she stops, so the tail of her own audio is not heard as an answer.
  useEffect(() => {
    if (speaking) { onAgentTalking(true); return; }
    const timer = setTimeout(() => onAgentTalking(false), 350);
    return () => clearTimeout(timer);
  }, [speaking, onAgentTalking]);
  const mouthOpen = useAgentMouth(speaking, conversation.getOutputVolume);
  const [gesture, setGesture] = useState(0);
  const shirtColor = useLogoBackground(study.logo ?? null);
  // A small wave when the interview is submitted.
  useEffect(() => { if (phase === 'done') setGesture(g => g + 1); }, [phase]);
  const productName = study.name || 'this product';

  return (
    <Shell>
      <div className="iv-stage" onPointerDown={() => setGesture(g => g + 1)}>
        <div className="iv-figure">
          {/* After the call she holds a wide smile ('ee' shape) as a thank-you. */}
          <CharacterCanvas mode={speaking ? 'speaking' : live ? 'listening' : 'idle'} mouthOpen={phase === 'done' ? 0.45 : mouthOpen} mouthShape={phase === 'done' ? 'ee' : mouthOpen > 0.15 ? 'aa' : 'rest'} gesture={gesture} shirtColor={shirtColor} />
          {study.logo && <img className="iv-shirt-logo" src={study.logo} alt="" />}
        </div>
      </div>

      {error && <div className="iv-error"><AlertCircle size={16} />{error}</div>}

      <div className="iv-actions">
        {(phase === 'ready' || phase === 'error') && (
          <button className="iv-mic" onClick={start} aria-label={phase === 'error' ? 'Try again' : 'Start interview'}>{phase === 'error' ? <RotateCcw size={28} /> : <Mic size={30} />}</button>
        )}
        {phase === 'connecting' && <button className="iv-mic" disabled aria-label="Connecting"><Loader2 className="iv-spin" size={28} /></button>}
        {live && (
          <>
            <button className={`iv-round ${muted ? 'off' : ''}`} onClick={() => setMuted(!muted)} aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}>
              {muted ? <MicOff size={22} /> : <Mic size={22} />}
            </button>
            <button className="iv-round end" onClick={() => conversation.endSession()} aria-label="End interview"><PhoneOff size={22} /></button>
          </>
        )}
        {phase === 'done' && (
          <div className="iv-done" role="status" aria-label="Interview submitted">
            <span className="iv-check"><Check size={34} strokeWidth={3} /></span>
            <button className="iv-round" onClick={() => setPhase('ready')} aria-label="Start over"><RotateCcw size={22} /></button>
          </div>
        )}
      </div>
    </Shell>
  );
}

/** The shirt takes the logo's background color, so the logo reads as printed on it; transparent logos get a white shirt. */
function useLogoBackground(logo: string | null): [number, number, number] | undefined {
  const [color, setColor] = useState<[number, number, number] | undefined>();
  useEffect(() => {
    if (!logo) { setColor(undefined); return; }
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 8; canvas.height = 8;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(image, 0, 0, 8, 8);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      setColor(a < 128 ? [255, 255, 255] : [r, g, b]);
    };
    image.src = logo;
  }, [logo]);
  return color;
}

/** Opens the character's mouth with the agent's output volume while it speaks. */
function useAgentMouth(speaking: boolean, getOutputVolume: () => number): number {
  const [open, setOpen] = useState(0);
  const read = useRef(getOutputVolume);
  read.current = getOutputVolume;
  useEffect(() => {
    if (!speaking) { setOpen(0); return; }
    let raf = 0;
    const tick = () => {
      let volume = 0;
      try { volume = read.current(); } catch { volume = 0; }
      setOpen(Math.min(1, volume * 2.5));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [speaking]);
  return open;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="iv-page">
      <main className="iv-card">
        {children}
      </main>
    </div>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return <div className="iv-notice"><AlertCircle size={22} /><h1>{title}</h1><p>{body}</p></div>;
}
