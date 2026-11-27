import { describe, expect, it } from 'vitest';
import { ArticulatedMotion, poseEnvelope, type RigPose } from './articulatedMotion';

const input = { mode: 'idle', gesture: 0, pointerX: 0, pointerY: 0, reduced: false };

describe('articulated gestures', () => {
  it('raises the forearm substantially and settles back before the next gesture', () => {
    const motion = new ArticulatedMotion(() => 0.5);
    let peak = 0;
    let pose: RigPose | undefined;
    for (let i = 0; i <= 420; i++) {
      pose = motion.update(i / 60, 1 / 60, input);
      peak = Math.max(peak, pose.rightFore);
    }
    expect(peak).toBeGreaterThan(0.9);
    expect(Math.abs(pose!.rightFore)).toBeLessThan(0.001);
  });

  it('keeps easing continuous through holds and returns', () => {
    for (const boundary of [0, 1.2, 2.3, 4.8]) {
      expect(Math.abs(poseEnvelope(boundary - 0.001) - poseEnvelope(boundary + 0.001))).toBeLessThan(0.0001);
    }
  });

  it('suppresses all motion when reduced motion is enabled', () => {
    const motion = new ArticulatedMotion(() => 0.5);
    for (let i = 0; i < 300; i++) {
      const pose = motion.update(i / 60, 1 / 60, { ...input, gesture: 1, reduced: true });
      expect(Object.values(pose).every((value) => value === 0)).toBe(true);
    }
  });
});
