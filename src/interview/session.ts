export type Phase = 'ready' | 'connecting' | 'live' | 'done' | 'error';

// A failed startSession only reaches onError, so without this the page would sit on the connecting spinner.
export function phaseAfterError(phase: Phase, hasConversation: boolean): Phase {
  return hasConversation ? phase : 'error';
}

export type SpeakingShape = 'aa' | 'rest';

const mouthGain = 2.5;
const openShapeAt = 0.15;
// Caps shape switches, and so Interview re-renders, at about five a second.
export const shapeHoldMs = 200;

export function mouthOpenFromVolume(volume: number): number {
  return Number.isFinite(volume) ? Math.max(0, Math.min(1, volume * mouthGain)) : 0;
}

export function nextSpeakingShape(current: SpeakingShape, open: number, msSinceSwitch: number): SpeakingShape {
  const wanted: SpeakingShape = open > openShapeAt ? 'aa' : 'rest';
  return wanted !== current && msSinceSwitch >= shapeHoldMs ? wanted : current;
}
