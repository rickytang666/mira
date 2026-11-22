import { blinkAt, settle } from './motion';

export type RigPose = { leftUpper:number;leftFore:number;leftHand:number;rightUpper:number;rightFore:number;rightHand:number;head:number;nod:number;breath:number;blink:number };
const neutral = {leftUpper:0,leftFore:0,leftHand:0,rightUpper:0,rightFore:0,rightHand:0,head:0,nod:0};
type Joints = typeof neutral;
const poses:Joints[] = [
  {...neutral,rightUpper:-.055,rightFore:1.0,rightHand:-.28,head:-.025,nod:2},
  {...neutral,leftUpper:-.055,leftFore:.42,leftHand:-.18,rightFore:.28,head:.032,nod:1},
  {...neutral,leftUpper:.02,leftFore:-.22,leftHand:.14,rightUpper:-.035,rightFore:.65,rightHand:-.18,head:-.024,nod:3},
  {...neutral,leftUpper:-.08,leftFore:.28,leftHand:-.1,rightFore:.18,head:.024,nod:0},
];
const ease=(n:number)=>{n=Math.max(0,Math.min(1,n));return n*n*n*(n*(6*n-15)+10);};
export function poseEnvelope(age:number) {
  if(age<0 || age>=4.8)return 0;
  if(age<1.2)return ease(age/1.2);
  if(age<2.3)return 1;
  return 1-ease((age-2.3)/2.5);
}
/** Angles are real rigid layer rotations, not per-pixel image deformation. */
export class ArticulatedMotion {
  private values:Joints={...neutral};private velocities:Joints={...neutral};
  private sequence=0;private started=.6;private nextGesture=7.5;
  private lastGesture=0;private nextBlink=2.9;private blinkStart=-10;private lastMode='idle';
  constructor(private random= Math.random) {}
  update(t:number,dt:number,input:{mode:string;gesture:number;pointerX:number;pointerY:number;reduced:boolean}) : RigPose {
    const tapped=input.gesture!==this.lastGesture;
    if(tapped){this.sequence=(this.sequence+1)%poses.length;this.started=t;this.nextGesture=t+7;this.lastGesture=input.gesture;this.nextBlink=t+.35;}
    if(input.mode!==this.lastMode){this.lastMode=input.mode;this.nextGesture=Math.min(this.nextGesture,t+.6);this.nextBlink=Math.min(this.nextBlink,t+.25);}
    if(t>=this.nextGesture){this.sequence=(this.sequence+1)%poses.length;this.started=t;this.nextGesture=t+(input.mode==='speaking'?3.2:8.5)+this.random()*1.4;}
    if(t>=this.nextBlink){this.blinkStart=t;this.nextBlink=t+3.1+this.random()*3.2;}
    const amount=poseEnvelope(t-this.started);
    const target={...neutral};
    for(const key of Object.keys(neutral) as (keyof Joints)[])target[key]=poses[this.sequence][key]*amount;
    target.head+=input.pointerX*.018+(input.mode==='listening'?-.025:0);
    target.nod+=input.pointerY*1.5;
    for(const key of Object.keys(neutral) as (keyof Joints)[]){const result=settle(this.values[key],this.velocities[key],input.reduced?0:target[key],Math.min(dt,.05),key==='head'?6:8);this.values[key]=result.position;this.velocities[key]=result.velocity;}
    return {...this.values,blink:input.reduced?0:blinkAt(t-this.blinkStart),breath:input.reduced?0:Math.sin(t*1.1)*1.0};
  }
}
