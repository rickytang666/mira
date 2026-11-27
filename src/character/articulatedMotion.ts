import { blinkAt, settle } from './motion';

export type RigPose = {
  leftUpper: number;
  leftFore: number;
  leftHand: number;
  rightUpper: number;
  rightFore: number;
  rightHand: number;
  head: number;
  nod: number;
  breath: number;
  blink: number;
};
const neutral = { leftUpper: 0, leftFore: 0, leftHand: 0, rightUpper: 0, rightFore: 0, rightHand: 0, head: 0, nod: 0 };
type Joints = typeof neutral;
const poses: Joints[] = [
  { ...neutral, rightUpper: -0.055, rightFore: 1.0, rightHand: -0.28, head: -0.025, nod: 2 },
  { ...neutral, leftUpper: -0.055, leftFore: 0.42, leftHand: -0.18, rightFore: 0.28, head: 0.032, nod: 1 },
  {
    ...neutral,
    leftUpper: 0.02,
    leftFore: -0.22,
    leftHand: 0.14,
    rightUpper: -0.035,
    rightFore: 0.65,
    rightHand: -0.18,
    head: -0.024,
    nod: 3,
  },
  { ...neutral, leftUpper: -0.08, leftFore: 0.28, leftHand: -0.1, rightFore: 0.18, head: 0.024, nod: 0 },
];
const ease = (n: number) => {
  n = Math.max(0, Math.min(1, n));
  return n * n * n * (n * (6 * n - 15) + 10);
};
export function poseEnvelope(age: number) {
  if (age < 0 || age >= 4.8) return 0;
  if (age < 1.2) return ease(age / 1.2);
  if (age < 2.3) return 1;
  return 1 - ease((age - 2.3) / 2.5);
}
/** Angles are real rigid layer rotations, not per-pixel image deformation. */
export class ArticulatedMotion {
  private values: Joints = { ...neutral };
  private velocities: Joints = { ...neutral };
  private sequence = 0;
  private started = 0.6;
  private nextGesture = 7.5;
  private lastGesture = 0;
  private nextBlink = 2.9;
  private blinkStart = -10;
  private lastMode = 'idle';
  constructor(private random = Math.random) {}
  update(
    t: number,
    dt: number,
    input: { mode: string; gesture: number; pointerX: number; pointerY: number; reduced: boolean },
  ): RigPose {
    const tapped = input.gesture !== this.lastGesture;
    if (tapped) {
      this.sequence = (this.sequence + 1) % poses.length;
      this.started = t;
      this.nextGesture = t + 7;
      this.lastGesture = input.gesture;
      this.nextBlink = t + 0.35;
    }
    if (input.mode !== this.lastMode) {
      this.lastMode = input.mode;
      this.nextGesture = Math.min(this.nextGesture, t + 0.6);
      this.nextBlink = Math.min(this.nextBlink, t + 0.25);
    }
    if (t >= this.nextGesture) {
      this.sequence = (this.sequence + 1) % poses.length;
      this.started = t;
      this.nextGesture = t + (input.mode === 'speaking' ? 3.2 : 8.5) + this.random() * 1.4;
    }
    if (t >= this.nextBlink) {
      this.blinkStart = t;
      this.nextBlink = t + 3.1 + this.random() * 3.2;
    }
    const amount = poseEnvelope(t - this.started);
    const target = { ...neutral };
    for (const key of Object.keys(neutral) as (keyof Joints)[]) target[key] = poses[this.sequence][key] * amount;
    target.head += input.pointerX * 0.018 + (input.mode === 'listening' ? -0.025 : 0);
    target.nod += input.pointerY * 1.5;
    for (const key of Object.keys(neutral) as (keyof Joints)[]) {
      const result = settle(
        this.values[key],
        this.velocities[key],
        input.reduced ? 0 : target[key],
        Math.min(dt, 0.05),
        key === 'head' ? 6 : 8,
      );
      this.values[key] = result.position;
      this.velocities[key] = result.velocity;
    }
    return {
      ...this.values,
      blink: input.reduced ? 0 : blinkAt(t - this.blinkStart),
      breath: input.reduced ? 0 : Math.sin(t * 1.1) * 1.0,
    };
  }
}
