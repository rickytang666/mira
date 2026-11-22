import { useEffect, useState } from 'react';
import { Ear, Hand, Play, Square, Volume2, VolumeX } from 'lucide-react';
import { CharacterCanvas } from './CharacterCanvas';
import { useDemoSpeech } from './useDemoSpeech';
import './AvatarDemo.css';

const INTRODUCTION = "Hi, I’m Mira. It’s lovely to meet you. I’d love to hear a little about your experience. There are no right answers here. What’s one thing you wish worked a little better?";

export function AvatarDemo() {
  const speech = useDemoSpeech();
  const [gesture, setGesture] = useState(0);
  const [listening,setListening] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return <main className="mia-stage" aria-label="Animated character preview">
    <div className="mia-character" onPointerDown={() => setGesture(value => value + 1)}>
      <CharacterCanvas mode={speech.isSpeaking ? 'speaking' : listening ? 'listening' : 'idle'} mouthOpen={speech.mouthOpen} mouthShape={speech.mouthShape} gesture={gesture} reducedMotion={reducedMotion}/>
    </div>
    <nav className="mia-controls" aria-label="Character controls">
      <button onClick={() => {speech.stop();setListening(value=>!value);}} aria-label="Preview listening pose" title="Preview listening pose (microphone off)" aria-pressed={listening}><Ear size={20} strokeWidth={1.7}/></button>
      <button onClick={() => setGesture(value => value + 1)} aria-label="Gesture" title="Gesture"><Hand size={20} strokeWidth={1.7}/></button>
      <button className="mia-speak" onClick={speech.isSpeaking ? speech.stop : () => speech.speak(INTRODUCTION)} aria-label={speech.isSpeaking ? 'Stop speaking' : 'Play browser voice preview'} title={speech.isSpeaking ? 'Stop speaking' : 'Play browser voice preview'}>{speech.isSpeaking ? <Square size={17} fill="currentColor"/> : <Play size={20} fill="currentColor"/>}</button>
      <button onClick={() => speech.setMuted(!speech.muted)} aria-label={speech.muted ? 'Enable preview voice' : 'Mute preview voice'} aria-pressed={speech.muted} title={speech.muted ? 'Enable preview voice' : 'Mute preview voice'}>{speech.muted ? <VolumeX size={20} strokeWidth={1.7}/> : <Volume2 size={20} strokeWidth={1.7}/>}</button>
    </nav>
  </main>;
}
