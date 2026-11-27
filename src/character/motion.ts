/** Small, intentional pose changes. All units are source-image pixels/radians. */
export const settle = (position: number, velocity: number, target: number, dt: number, frequency: number) => {
  const offset = position - target;
  const decay = Math.exp(-frequency * dt);
  const impulse = velocity + frequency * offset;
  return {
    position: target + (offset + impulse * dt) * decay,
    velocity: (velocity - frequency * impulse * dt) * decay,
  };
};
const ease = (x: number) => {
  x = Math.max(0, Math.min(1, x));
  return x * x * x * (x * (x * 6 - 15) + 10);
};
export function blinkAt(age: number) {
  if (age < 0 || age >= 0.255) return 0;
  if (age < 0.075) return ease(age / 0.075);
  if (age < 0.105) return 1;
  return 1 - ease((age - 0.105) / 0.15);
}
/** Ease in, brief hold, then an unhurried return. Never an endless sine wave. */
export function gestureAt(age: number) {
  if (age < 0 || age > 2.7) return 0;
  if (age < 0.7) return ease(age / 0.7);
  if (age < 1.2) return 1;
  return 1 - ease((age - 1.2) / 1.5);
}
class Joint {
  position = 0;
  velocity = 0;
  step(target: number, dt: number, frequency = 8) {
    const next = settle(this.position, this.velocity, target, dt, frequency);
    this.position = next.position;
    this.velocity = next.velocity;
    return this.position;
  }
}
export class CharacterMotion {
  private head = new Joint();
  private arm = new Joint();
  private nod = new Joint();
  private hair = new Joint();
  private nextFocus = 4.3;
  private focus = 0;
  private nextBlink = 2.1;
  private blinkStart = -10;
  private gestureStart = -10;
  private nodStart = -10;
  private nextBeat = 0;
  private lastGesture = 0;
  private lastMode = 'idle';
  constructor(private random: () => number = Math.random) {}
  update(
    t: number,
    dt: number,
    input: { mode: string; gesture: number; pointerX: number; pointerY: number; reduced: boolean; mouthOpen: number },
  ) {
    const triggered = input.gesture !== this.lastGesture;
    const modeChanged = input.mode !== this.lastMode;
    this.lastGesture = input.gesture;
    this.lastMode = input.mode;
    if (triggered) {
      this.gestureStart = t;
      this.nodStart = t + 0.24;
      this.blinkStart = t + 0.05;
      this.nextBlink = t + 4;
    }
    if (modeChanged) {
      this.nextBlink = Math.min(this.nextBlink, t + 0.22);
      this.nextBeat = t + 1.3;
    }
    // Speaking gets occasional phrase-level emphasis. Quiet idle has quiet hands.
    if (input.mode === 'speaking' && t > this.nextBeat && input.mouthOpen > 0.4) {
      this.gestureStart = t;
      this.nextBeat = t + 4.5 + this.random() * 2.5;
    }
    if (t > this.nextFocus) {
      this.focus = (this.random() - 0.5) * 0.016;
      this.nextFocus = t + 5 + this.random() * 5;
      if (input.mode === 'listening') this.nodStart = t;
    }
    if (t > this.nextBlink) {
      this.blinkStart = t;
      this.nextBlink = t + 3.5 + this.random() * 4;
    }
    const gesture = gestureAt(t - this.gestureStart);
    const nodAge = t - this.nodStart;
    const nodTarget = nodAge >= 0 && nodAge < 1.35 ? Math.sin((Math.PI * nodAge) / 1.35) ** 2 * 1.8 : 0;
    const headTarget =
      this.focus + input.pointerX * 0.012 + (input.mode === 'listening' ? -0.014 : 0) - gesture * 0.008;
    const head = this.head.step(input.reduced ? 0 : headTarget, dt, 7);
    const arm = this.arm.step(input.reduced ? 0 : -gesture * 0.045, dt, 9);
    const nod = this.nod.step(input.reduced ? 0 : nodTarget + input.pointerY * 0.7, dt, 9);
    const hair = this.hair.step(head, dt, 4);
    return {
      head,
      arm,
      nod,
      hairLag: input.reduced ? 0 : (hair - head) * 65,
      blink: input.reduced ? 0 : blinkAt(t - this.blinkStart),
      smile: input.reduced ? 0 : gesture,
      breath: input.reduced ? 0 : Math.sin((t * Math.PI * 2) / 5.6) * 0.65,
    };
  }
}
