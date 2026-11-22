import { describe, expect, it } from 'vitest';
import { blinkAt, CharacterMotion, gestureAt, settle } from './motion';

describe('character motion', () => {
  it('closes the eyelid completely, holds it briefly, then reopens', () => {
    expect(blinkAt(-1)).toBe(0);
    expect(blinkAt(0)).toBe(0);
    expect(blinkAt(.08)).toBe(1);
    expect(blinkAt(.10)).toBe(1);
    expect(blinkAt(.255)).toBe(0);
    expect(blinkAt(.04)).toBeGreaterThan(blinkAt(.215));
  });
  it('settles identically at 30, 60 and 120 fps without overshoot', () => {
    const result = [30,60,120].map(fps => {
      let position=0,velocity=0;
      for(let i=0;i<fps;i++) {
        ({position,velocity}=settle(position,velocity,1,1/fps,8));
        expect(position).toBeLessThanOrEqual(1);
      }
      return position;
    });
    expect(result[0]).toBeCloseTo(result[1],10);
    expect(result[1]).toBeCloseTo(result[2],10);
  });
  it('keeps the idle hand still rather than looping an automatic wave', () => {
    const motion=new CharacterMotion(()=>.5);
    for(let i=0;i<600;i++) expect(motion.update(i/60,1/60,{mode:'idle',gesture:0,pointerX:0,pointerY:0,reduced:false,mouthOpen:0}).arm).toBe(0);
  });
  it('returns gestures to rest and suppresses them for reduced motion', () => {
    expect(gestureAt(-1)).toBe(0);expect(gestureAt(.8)).toBe(1);expect(gestureAt(3)).toBe(0);
    const motion=new CharacterMotion(()=>.5);
    const pose=motion.update(.1,1/60,{mode:'speaking',gesture:1,pointerX:1,pointerY:1,reduced:true,mouthOpen:.8});
    expect(pose.arm).toBe(0);expect(pose.head).toBe(0);expect(pose.blink).toBe(0);expect(pose.breath).toBe(0);
  });
});
