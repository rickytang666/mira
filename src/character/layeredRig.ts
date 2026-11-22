import type { RigPose } from './articulatedMotion';
export const RIG_WIDTH=1180;
export const RIG_HEIGHT=1580;
type Point=[number,number];
type Sprite={canvas:HTMLCanvasElement;x:number;y:number};
const headPath='M170 0H880V790L699 780L651 770L642 760L504 745L490 755L425 790H170Z';
const bodyPath='M497 624L640 644L653 719Q717 748 809 773L841 1060L884 1290L875 1460L921 1536H158L275 1245L300 950L296 733L440 738L491 696Z';
const leftUpperPath='M264 706Q202 720 176 829Q146 921 139 1028L127 1145Q86 1196 110 1236Q67 1268 102 1340Q131 1418 213 1415L282 1376Q315 1298 327 1189L301 954L314 741Z';
const leftForePath='M171 1127L258 1116L258 1212Q277 1284 246 1324Q215 1373 190 1364Q141 1342 133 1293L143 1221Z';
const leftHandPath='M171 1152L172 1129Q116 1131 88 1100L39 1074Q29 1051 54 1051L99 1069L109 1049Q70 1020 68 992Q71 975 91 987L145 1014Q205 1014 241 1054Q269 1086 258 1120L255 1153Z';
const rightUpperPath='M771 753Q872 762 893 891L915 1082L924 1140Q972 1180 953 1212L936 1236Q964 1303 932 1349L891 1393L810 1408L768 1340L756 1216L741 1025L727 783Z';
const rightForePath='M642 1327L800 1309Q859 1298 878 1354Q890 1399 843 1422L641 1428L610 1411Z';
const rightHandPath='M649 1328L659 1428Q618 1433 576 1451L522 1494Q488 1529 470 1528L477 1508Q449 1534 442 1522L447 1498L455 1465Q437 1505 433 1495L442 1444Q459 1401 496 1385L554 1350Z';
const parts={head:headPath,body:bodyPath,leftUpper:leftUpperPath,leftFore:leftForePath,leftHand:leftHandPath,rightUpper:rightUpperPath,rightFore:rightForePath,rightHand:rightHandPath};
const bounds:Record<keyof typeof parts,[number,number,number,number]>={head:[160,0,740,800],body:[150,610,800,926],leftUpper:[65,695,280,735],leftFore:[120,1100,165,280],leftHand:[25,970,255,195],rightUpper:[715,740,275,690],rightFore:[600,1295,295,150],rightHand:[420,1315,255,221]};
const joints={left:{shoulder:[269,782] as Point,elbow:[193,1301] as Point,wrist:[216,1136] as Point},right:{shoulder:[827,820] as Point,elbow:[853,1363] as Point,wrist:[643,1389] as Point}};

function paperRemoved(image:HTMLImageElement){
  const c=document.createElement('canvas');c.width=1024;c.height=1536;
  const ctx=c.getContext('2d',{willReadFrequently:true})!;ctx.drawImage(image,0,0);
  const frame=ctx.getImageData(0,0,1024,1536),data=frame.data,total=1024*1536;
  const seen=new Uint8Array(total),queue=new Int32Array(total);let count=0;
  const add=(i:number)=>{if(i<0||i>=total||seen[i])return;seen[i]=1;const p=i*4;if(data[p]>225&&data[p+1]>227&&data[p+2]>221)queue[count++]=i;};
  for(let x=0;x<1024;x++){add(x);add(total-1024+x);}for(let y=0;y<1536;y++){add(y*1024);add(y*1024+1023);}
  for(let n=0;n<count;n++){const i=queue[n];data[i*4+3]=0;if(i%1024)add(i-1);if(i%1024<1023)add(i+1);add(i-1024);add(i+1024);}
  ctx.putImageData(frame,0,0);return c;
}
function makeSprite(source:HTMLCanvasElement,key:keyof typeof parts,erase:string[]=[],paint?:(ctx:CanvasRenderingContext2D)=>void):Sprite{
  const [x,y,w,h]=bounds[key],canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d')!;ctx.translate(-x,-y);
  ctx.save();const outline=new Path2D(parts[key]);ctx.fill(outline);ctx.lineWidth=4;ctx.lineJoin='round';ctx.stroke(outline);ctx.globalCompositeOperation='source-in';paint?.(ctx);ctx.drawImage(source,0,0);
  ctx.globalCompositeOperation='destination-out';for(const path of erase)ctx.fill(new Path2D(path));ctx.restore();
  return {canvas,x,y};
}
function solidUnderlay(source:Sprite,paint:(ctx:CanvasRenderingContext2D)=>void){
  const c=document.createElement('canvas');c.width=source.canvas.width;c.height=source.canvas.height;
  const ctx=c.getContext('2d')!;ctx.translate(-source.x,-source.y);paint(ctx);ctx.drawImage(source.canvas,source.x,source.y);source.canvas=c;
}
function draw(ctx:CanvasRenderingContext2D,s:Sprite){ctx.drawImage(s.canvas,s.x,s.y);}
function hinge(ctx:CanvasRenderingContext2D,p:Point,angle:number){ctx.translate(p[0],p[1]);ctx.rotate(angle);ctx.translate(-p[0],-p[1]);}

/** Split once into cached illustration layers. Frames only transform/draw sprites. */
export function createLayeredRig(image:HTMLImageElement){
  const source=paperRemoved(image);
  const colorCache=new Map<string,string>();
  const colors=source.getContext('2d',{willReadFrequently:true})!;
  const color=(x:number,y:number)=>{const key=x+','+y;const cached=colorCache.get(key);if(cached)return cached;const d=colors.getImageData(x,y,1,1).data;const value=`rgb(${d[0]} ${d[1]} ${d[2]})`;colorCache.set(key,value);return value;};
  [[195,1280],[218,1154],[842,1350]].forEach(([x,y])=>color(x,y));
  const head=makeSprite(source,'head');
  const body=makeSprite(source,'body',[headPath,leftUpperPath,leftForePath,leftHandPath,rightUpperPath,rightForePath,rightHandPath]);
  // Reconstruct the small occluded areas behind the original forearm. These are
  // underlayers: moving arms reveal clothing instead of the original baked-in arm.
  solidUnderlay(body,ctx=>{
    ctx.save();ctx.clip(new Path2D(bodyPath));
    ctx.fillStyle=color(562,704);ctx.fill(new Path2D('M494 615L643 640L655 777Q547 836 463 764Z'));
    ctx.fillStyle='#dcd1c2';ctx.fill(new Path2D('M282 738L377 782L298 1420L251 1440Z'));ctx.fill(new Path2D('M739 772L827 799L877 1426L731 1435Z'));
    ctx.fillStyle='#4e7274';ctx.fill(new Path2D('M367 1224L779 1225L783 1428L370 1428Z'));
    ctx.fillStyle='#3b5e61';ctx.fill(new Path2D('M370 1374L733 1278L698 1404H370Z'));
    ctx.fillStyle='#4c3931';ctx.fillRect(355,1381,420,155);
    ctx.fillStyle='#6f4d38';ctx.fillRect(360,1394,410,37);ctx.restore();
    ctx.fillStyle='#ded3c5';ctx.beginPath();ctx.ellipse(278,792,59,77,0,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.ellipse(816,824,58,75,0,0,Math.PI*2);ctx.fill();
  });
  const leftUpper=makeSprite(source,'leftUpper',[leftForePath,leftHandPath]);
  solidUnderlay(leftUpper,ctx=>{ctx.save();ctx.clip(new Path2D(leftUpperPath));ctx.fillStyle='#ded3c5';ctx.fillRect(80,1000,250,420);ctx.fillStyle='#aa9989';ctx.fill(new Path2D('M112 1180Q95 1250 138 1335Q181 1400 222 1380L264 1330Q156 1356 141 1242Z'));ctx.restore();});
  const rightUpper=makeSprite(source,'rightUpper',[rightForePath,rightHandPath]);
  solidUnderlay(rightUpper,ctx=>{ctx.save();ctx.clip(new Path2D(rightUpperPath));ctx.fillStyle='#ddd1c2';ctx.fillRect(750,1250,220,180);ctx.restore();});
  const leftFore=makeSprite(source,'leftFore'),leftHand=makeSprite(source,'leftHand');
  const rightFore=makeSprite(source,'rightFore'),rightHand=makeSprite(source,'rightHand');
  const sampling=source.getContext('2d',{willReadFrequently:true})!;
  const sample=(x:number,y:number)=>{const d=sampling.getImageData(x,y,1,1).data;return `rgb(${d[0]} ${d[1]} ${d[2]})`;};
  const skinLeft=sample(531,457),skinRight=sample(556,452),mouthSkin=sample(610,533);
  // Preserve burgundy glasses on top of eyelids. The pixel mask contains frame
  // pigment only; it does not reintroduce the pupils or eyelashes during a blink.
  const glasses=document.createElement('canvas');glasses.width=360;glasses.height=190;
  const gctx=glasses.getContext('2d')!;const g=sampling.getImageData(355,320,360,190);
  for(let i=0;i<g.data.length;i+=4){const r=g.data[i],green=g.data[i+1],b=g.data[i+2];if(!(r>70&&r<190&&r>green*1.65&&b>green*1.08))g.data[i+3]=0;}
  gctx.putImageData(g,0,0);
  function eye(ctx:CanvasRenderingContext2D,cx:number,cy:number,rx:number,ry:number,slope:number,blink:number,skin:string){
    if(blink<.002)return;
    ctx.save();ctx.translate(cx,cy);ctx.transform(1,slope,0,1,0,0);
    ctx.beginPath();ctx.ellipse(0,0,rx,ry,0,0,Math.PI*2);ctx.clip();
    const upper=-ry*.75+(ry*1.04)*blink,lower=ry*.72-ry*.43*blink;
    ctx.fillStyle=skin;
    ctx.beginPath();ctx.moveTo(-rx,-ry);ctx.lineTo(rx,-ry);ctx.lineTo(rx,upper+7);ctx.quadraticCurveTo(0,upper-9, -rx,upper+7);ctx.closePath();ctx.fill();
    ctx.beginPath();ctx.moveTo(-rx,ry);ctx.lineTo(rx,ry);ctx.lineTo(rx,lower-5);ctx.quadraticCurveTo(0,lower+7,-rx,lower-5);ctx.closePath();ctx.fill();
    ctx.strokeStyle='#42291f';ctx.lineWidth=2.4;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-rx*.93,upper+6);ctx.quadraticCurveTo(0,upper-8,rx*.93,upper+6);ctx.stroke();
    ctx.restore();
  }
  function mouth(ctx:CanvasRenderingContext2D,open:number,shape:string){
    if(open<.08)return;
    ctx.save();ctx.translate(567,527);ctx.rotate(-.12);
    ctx.fillStyle=mouthSkin;ctx.beginPath();ctx.ellipse(0,0,43,23,0,0,Math.PI*2);ctx.fill();
    const w=shape==='oh'?19:31,h=5+open*28;
    ctx.beginPath();ctx.moveTo(-w,-3);ctx.quadraticCurveTo(0,2,w,-3);ctx.bezierCurveTo(w*.8,h,-w*.6,h+4,-w,-3);ctx.closePath();
    ctx.fillStyle='#603232';ctx.fill();ctx.strokeStyle='#60382e';ctx.lineWidth=1.7;ctx.stroke();ctx.clip();
    ctx.fillStyle='#dc8e87';ctx.beginPath();ctx.ellipse(2,h-3,w*.72,8,0,0,Math.PI*2);ctx.fill();
    if(shape!=='oh'){ctx.fillStyle='#fff6e9';ctx.fillRect(-w,-4,w*2,7);}ctx.restore();
  }
  return {draw(ctx:CanvasRenderingContext2D,pose:RigPose,mouthOpen:number,mouthShape:string){
    ctx.save();ctx.translate(78,14-pose.breath);
    draw(ctx,body);
    ctx.save();hinge(ctx,joints.left.shoulder,pose.leftUpper);draw(ctx,leftUpper);
    ctx.fillStyle=color(195,1280);ctx.beginPath();ctx.ellipse(193,1301,46,50,0,0,Math.PI*2);ctx.fill();
    hinge(ctx,joints.left.elbow,pose.leftFore);draw(ctx,leftFore);ctx.fillStyle=color(218,1154);ctx.beginPath();ctx.ellipse(216,1136,38,17,0,0,Math.PI*2);ctx.fill();hinge(ctx,joints.left.wrist,pose.leftHand);draw(ctx,leftHand);ctx.restore();
    ctx.save();hinge(ctx,joints.right.shoulder,pose.rightUpper);draw(ctx,rightUpper);
    ctx.fillStyle=color(842,1350);ctx.beginPath();ctx.ellipse(853,1363,29,34,0,0,Math.PI*2);ctx.fill();
    hinge(ctx,joints.right.elbow,pose.rightFore);draw(ctx,rightFore);ctx.beginPath();ctx.ellipse(643,1389,22,38,0,0,Math.PI*2);ctx.fill();hinge(ctx,joints.right.wrist,pose.rightHand);draw(ctx,rightHand);ctx.restore();
    ctx.save();ctx.translate(0,pose.nod);hinge(ctx,[552,730],pose.head);draw(ctx,head);
    eye(ctx,454,421,54,39,-.19,pose.blink,skinLeft);eye(ctx,614,377,52,40,-.17,pose.blink,skinRight);
    if(pose.blink>.002)ctx.drawImage(glasses,355,320);
    mouth(ctx,mouthOpen,mouthShape);ctx.restore();ctx.restore();
  }};
}
