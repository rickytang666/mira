import { describe, expect, it } from 'vitest';
import { mouthOpenFromVolume, nextSpeakingShape, phaseAfterError, type SpeakingShape, shapeHoldMs } from './session';

describe('phaseAfterError', () => {
  it('leaves the connecting spinner for the retry button when the session never started', () => {
    expect(phaseAfterError('connecting', false)).toBe('error');
  });
  it('keeps the phase once a conversation exists, so onDisconnect decides', () => {
    expect(phaseAfterError('live', true)).toBe('live');
    expect(phaseAfterError('done', true)).toBe('done');
  });
});

describe('speaking mouth', () => {
  it('clamps volume to a 0..1 opening', () => {
    expect(mouthOpenFromVolume(0.2)).toBeCloseTo(0.5);
    expect(mouthOpenFromVolume(3)).toBe(1);
    expect(mouthOpenFromVolume(-1)).toBe(0);
    expect(mouthOpenFromVolume(Number.NaN)).toBe(0);
  });

  it('switches shape at most about five times a second on a noisy 60 Hz volume', () => {
    let shape: SpeakingShape = 'rest';
    let switchedAt = 0;
    let switches = 0;
    for (let frame = 0; frame < 600; frame++) {
      const now = frame * (1000 / 60);
      const open = mouthOpenFromVolume(frame % 2 ? 0.3 : 0);
      const next = nextSpeakingShape(shape, open, now - switchedAt);
      if (next !== shape) {
        shape = next;
        switchedAt = now;
        switches++;
      }
    }
    expect(switches).toBeGreaterThan(0);
    expect(switches).toBeLessThanOrEqual(10 * (1000 / shapeHoldMs));
  });

  it('opens on loud frames and closes on quiet ones once the hold has passed', () => {
    expect(nextSpeakingShape('rest', 0.5, shapeHoldMs)).toBe('aa');
    expect(nextSpeakingShape('aa', 0, shapeHoldMs)).toBe('rest');
    expect(nextSpeakingShape('rest', 0.5, shapeHoldMs - 1)).toBe('rest');
  });
});
