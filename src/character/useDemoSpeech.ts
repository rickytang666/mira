import { useCallback, useEffect, useRef, useState } from 'react';

export type MouthShape = 'rest' | 'aa' | 'ee' | 'oh' | 'mm';
type Segment = { start: number; end: number; shape: MouthShape; openness: number; word: number };
export type SpeechWord = { text: string; charIndex: number; start: number; end: number };
export type SpeechTimeline = { words: SpeechWord[]; segments: Segment[]; duration: number };

// A lightweight, intentionally approximate text-to-viseme preview. Production voice
// can supply audio/phoneme timing to the character without changing its renderer.
export function buildSpeechTimeline(text: string): SpeechTimeline {
  const words: SpeechWord[] = [];
  const segments: Segment[] = [];
  let time = 0;
  for (const match of text.matchAll(/\S+/g)) {
    const wordIndex = words.length;
    const start = time;
    const chars = Array.from(match[0].toLowerCase());
    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];
      const next = chars[i + 1] || '';
      let shape: MouthShape = 'rest';
      let openness = 0;
      let duration = 39;
      if (/[.!?…]/.test(char)) duration = 270;
      else if (/[,;:—–]/.test(char)) duration = 135;
      else if (/[mbp]/.test(char)) { shape = 'mm'; duration = 40; }
      else if (/[ou]/.test(char)) { shape = 'oh'; openness = 0.68; duration = 67; }
      else if (/[ei]/.test(char)) { shape = 'ee'; openness = 0.43; duration = 58; }
      else if (/[ay]/.test(char)) { shape = 'aa'; openness = 0.79; duration = 65; }
      else if (/[a-z0-9]/.test(char)) { shape = 'ee'; openness = 0.24; }
      if (char === next && /[aeiou]/.test(char)) duration *= 0.7;
      segments.push({ start: time, end: time + duration, shape, openness, word: wordIndex });
      time += duration;
    }
    words.push({ text: match[0], charIndex: match.index!, start, end: time });
    segments.push({ start: time, end: time + 55, shape: 'rest', openness: 0, word: wordIndex });
    time += 55;
  }
  return { words, segments, duration: time };
}

export function sampleSpeechTimeline(timeline: SpeechTimeline, time: number) {
  if (time < 0 || time >= timeline.duration || timeline.segments.length === 0) {
    return { mouthOpen: 0, mouthShape: 'rest' as MouthShape, currentWord: -1 };
  }
  let low = 0;
  let high = timeline.segments.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (timeline.segments[mid].end <= time) low = mid + 1;
    else high = mid;
  }
  const segment = timeline.segments[low];
  const previous = timeline.segments[Math.max(0, low - 1)];
  const phase = Math.min(1, (time - segment.start) / 36);
  const smooth = phase * phase * (3 - 2 * phase);
  return {
    mouthOpen: previous.openness + (segment.openness - previous.openness) * smooth,
    mouthShape: segment.shape,
    currentWord: segment.word,
  };
}

type Frame = { isSpeaking: boolean; currentWord: number; mouthOpen: number; mouthShape: MouthShape; status: string };
const resting: Frame = { isSpeaking: false, currentWord: -1, mouthOpen: 0, mouthShape: 'rest', status: 'Ready' };
type Session = {
  token: number;
  raf: number;
  timer: ReturnType<typeof setTimeout> | null;
  utterance: SpeechSynthesisUtterance | null;
  timeline: SpeechTimeline;
  startTime: number;
  anchorTime: number;
  anchorPosition: number;
  boundaryWord: number;
  nativeAudio: boolean;
  started: boolean;
};

function selectVoice(voices: SpeechSynthesisVoice[]) {
  const english = voices.filter(voice => /^en[-_]/i.test(voice.lang));
  return english.find(voice => /samantha|serena|aria|jenny|ava|karen|moira|zira|female/i.test(voice.name))
    || english.find(voice => voice.localService)
    || english[0];
}

export function useDemoSpeech() {
  const [frame, setFrame] = useState<Frame>(resting);
  const [muted, updateMuted] = useState(false);
  const mutedRef = useRef(false);
  const sessionRef = useRef<Session | null>(null);
  const generation = useRef(0);

  const cancelSession = useCallback(() => {
    generation.current++;
    const session = sessionRef.current;
    sessionRef.current = null;
    if (!session) return;
    cancelAnimationFrame(session.raf);
    if (session.timer) clearTimeout(session.timer);
    if (session.utterance && 'speechSynthesis' in window) {
      session.utterance.onstart = null;
      session.utterance.onend = null;
      session.utterance.onerror = null;
      session.utterance.onboundary = null;
      window.speechSynthesis.cancel();
    }
  }, []);

  const stop = useCallback(() => {
    cancelSession();
    setFrame(resting);
  }, [cancelSession]);

  const setMuted = useCallback((value: boolean | ((previous: boolean) => boolean)) => {
    const next = typeof value === 'function' ? value(mutedRef.current) : value;
    if (next !== mutedRef.current) stop();
    mutedRef.current = next;
    updateMuted(next);
  }, [stop]);

  const speak = useCallback((input: string) => {
    cancelSession();
    const text = input.trim().slice(0, 3000);
    const timeline = buildSpeechTimeline(text);
    if (!timeline.words.length) { setFrame(resting); return; }
    const canSpeak = !mutedRef.current && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
    const now = performance.now();
    const session: Session = {
      token: generation.current, raf: 0, timer: null, utterance: null, timeline,
      startTime: now, anchorTime: now, anchorPosition: 0, boundaryWord: -1,
      nativeAudio: canSpeak, started: !canSpeak,
    };
    sessionRef.current = session;
    let lastRender = 0;
    // Native engines that expose no boundary events tend to speak more slowly
    // than a letter-only timing estimate. Calibrate that estimate to ~175 wpm.
    const nativeEstimateScale = Math.max(1, timeline.words.length * 60000 / 175 / timeline.duration);
    let status = canSpeak ? 'Starting browser voice' : mutedRef.current ? 'Text preview' : 'Voice unavailable · text preview';
    const active = () => sessionRef.current === session && generation.current === session.token;
    const finish = () => {
      if (!active()) return;
      cancelSession();
      setFrame({ ...resting, status: 'Finished' });
    };
    const fallback = () => {
      if (!active()) return;
      if (session.timer) clearTimeout(session.timer);
      session.timer = null;
      // Continue from the last native boundary if audio failed partway through.
      const position = session.started
        ? Math.min(timeline.duration, session.anchorPosition + (performance.now() - session.anchorTime) / (session.nativeAudio && session.boundaryWord < 0 ? nativeEstimateScale : 1))
        : 0;
      session.nativeAudio = false;
      session.started = true;
      session.boundaryWord = -1;
      session.anchorPosition = position;
      session.anchorTime = performance.now();
      status = 'Voice unavailable · text preview';
      if (session.utterance) {
        session.utterance.onend = null;
        session.utterance.onerror = null;
        session.utterance.onstart = null;
        session.utterance.onboundary = null;
        window.speechSynthesis.cancel();
      }
    };
    const tick = (stamp: number) => {
      if (!active()) return;
      if (stamp - lastRender >= 1000 / 30) {
        lastRender = stamp;
        const elapsed = stamp - session.anchorTime;
        let position = session.started
          ? session.anchorPosition + elapsed / (session.nativeAudio && session.boundaryWord < 0 ? nativeEstimateScale : 1)
          : -1;
        const estimatedPosition = position;
        // Once real boundaries arrive, subtitles never run into the next word
        // before the browser speaks it. Engines without boundaries use the estimate.
        if (session.nativeAudio && session.boundaryWord >= 0) {
          position = Math.min(position, timeline.words[session.boundaryWord].end - 1);
        }
        if (!session.nativeAudio && position >= timeline.duration) { finish(); return; }
        const sample = sampleSpeechTimeline(timeline, position);
        if (session.nativeAudio && session.boundaryWord < 0 && position >= timeline.duration) {
          // There is no phoneme clock on these engines. Keep a restrained talking
          // motion until their real onend event rather than visibly falling idle
          // while speech continues; the UI identifies this as a browser preview.
          const cycle = (elapsed % 420) / 420;
          sample.currentWord = timeline.words.length - 1;
          sample.mouthOpen = cycle < 0.78 ? 0.28 * Math.sin(cycle / 0.78 * Math.PI) : 0;
          sample.mouthShape = sample.mouthOpen > 0.05 ? 'aa' : 'rest';
        }
        if (session.nativeAudio && session.boundaryWord >= 0) {
          sample.currentWord = session.boundaryWord;
          // A slow speaker or a pause between native boundaries should never
          // leave the mouth frozen open at the final letter of a word.
          const overrun = estimatedPosition - timeline.words[session.boundaryWord].end;
          if (overrun > 0) sample.mouthOpen *= Math.max(0, 1 - overrun / 100);
          if (overrun >= 100) sample.mouthShape = 'rest';
        }
        setFrame({ ...sample, isSpeaking: true, status });
      }
      session.raf = requestAnimationFrame(tick);
    };
    setFrame({ ...resting, isSpeaking: true, status });
    session.raf = requestAnimationFrame(tick);
    if (!canSpeak) return;
    try {
      const utterance = new SpeechSynthesisUtterance(text);
      session.utterance = utterance;
      const voice = selectVoice(window.speechSynthesis.getVoices());
      if (voice) { utterance.voice = voice; utterance.lang = voice.lang; }
      else utterance.lang = 'en-US';
      utterance.rate = 1.02;
      utterance.pitch = 1.03;
      utterance.volume = 0.85;
      utterance.onstart = () => {
        if (!active()) return;
        if (session.timer) clearTimeout(session.timer);
        session.started = true;
        session.startTime = performance.now();
        session.anchorTime = session.startTime;
        session.anchorPosition = 0;
        status = 'Browser voice';
        // A bounded safety timer prevents a failed native speech engine from
        // leaving the avatar talking forever (especially after device changes).
        session.timer = setTimeout(fallback, Math.max(15000, timeline.duration * 2.5 + 6000));
      };
      utterance.onboundary = event => {
        if (!active() || !session.started || (event.name && event.name !== 'word')) return;
        let index = 0;
        for (let i = 1; i < timeline.words.length; i++) {
          if (timeline.words[i].charIndex > event.charIndex) break;
          index = i;
        }
        session.boundaryWord = index;
        session.anchorPosition = timeline.words[index].start;
        session.anchorTime = performance.now();
      };
      utterance.onend = () => {
        // Some embedded browsers report immediate completion without producing
        // audio. Keep the visual sample usable with the silent timeline.
        if (!session.started || performance.now() - session.startTime < 200) fallback();
        else finish();
      };
      utterance.onerror = fallback;
      session.timer = setTimeout(fallback, 2500);
      window.speechSynthesis.speak(utterance);
    } catch { fallback(); }
  }, [cancelSession]);

  useEffect(() => {
    // Request the local voice catalog ahead of the user's first interaction.
    if ('speechSynthesis' in window) window.speechSynthesis.getVoices();
    return cancelSession;
  }, [cancelSession]);

  return { ...frame, speak, stop, muted, setMuted };
}
