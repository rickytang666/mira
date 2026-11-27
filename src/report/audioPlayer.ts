import type { ReportQuote } from '../agent/internalTypes';

export interface PlayerState {
  quoteId: string | null;
  status: 'idle' | 'loading' | 'playing';
  error: string;
}
export function playable(quote: ReportQuote): quote is ReportQuote & { audioUrl: string; startSec: number } {
  return (
    !!quote.audioUrl &&
    quote.startSec !== null &&
    Number.isFinite(quote.startSec) &&
    quote.startSec >= 0 &&
    (quote.endSec === null || (Number.isFinite(quote.endSec) && quote.endSec > quote.startSec))
  );
}

/** One audio element per selection prevents stale async playback from winning a newer click. */
export function createQuotePlayer(
  onChange: (state: PlayerState) => void,
  makeAudio: () => HTMLAudioElement = () => new Audio(),
) {
  let active: { audio: HTMLAudioElement; quote: ReportQuote } | null = null;
  let state: PlayerState = { quoteId: null, status: 'idle', error: '' };
  const emit = (value: PlayerState) => {
    state = value;
    onChange(value);
  };
  function release() {
    if (!active) return;
    const audio = active.audio;
    active = null;
    audio.onloadedmetadata = audio.oncanplay = audio.ontimeupdate = audio.onended = audio.onerror = null;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  }
  function stop() {
    release();
    emit({ quoteId: null, status: 'idle', error: '' });
  }
  async function play(quote: ReportQuote) {
    if (active?.quote.id === quote.id) {
      stop();
      return;
    }
    release();
    if (!playable(quote)) {
      emit({ quoteId: quote.id, status: 'idle', error: 'This quote has no recording or valid timestamp.' });
      return;
    }
    const audio = makeAudio();
    const selection = { audio, quote };
    active = selection;
    emit({ quoteId: quote.id, status: 'loading', error: '' });
    let sought = false;
    const fail = (message: string) => {
      if (active !== selection) return;
      release();
      emit({ quoteId: quote.id, status: 'idle', error: message });
    };
    const seek = () => {
      if (active !== selection || sought) return;
      if (Number.isFinite(audio.duration) && quote.startSec >= audio.duration) {
        fail('The quote starts beyond this recording.');
        return;
      }
      try {
        audio.currentTime = quote.startSec;
        sought = true;
      } catch {
        fail('Could not seek this recording. Try again.');
      }
    };
    audio.preload = 'auto';
    audio.onloadedmetadata = seek;
    audio.oncanplay = seek;
    audio.ontimeupdate = () => {
      if (active === selection && sought && quote.endSec !== null && audio.currentTime >= quote.endSec) stop();
    };
    audio.onended = () => {
      if (active === selection) stop();
    };
    audio.onerror = () => fail('Could not load the recording. Refresh the report or try again.');
    audio.src = quote.audioUrl;
    audio.load();
    // Call play in the click gesture (important on mobile); metadata callback seeks before playback.
    try {
      await audio.play();
      if (active !== selection) {
        audio.pause();
        return;
      }
      seek();
      if (active === selection) emit({ quoteId: quote.id, status: 'playing', error: '' });
    } catch {
      fail('Playback was blocked or unavailable. Tap play to retry.');
    }
  }
  return { play, stop, dispose: release, getState: () => state };
}
