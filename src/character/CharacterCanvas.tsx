import { useEffect, useRef, useState } from 'react';
import { ArticulatedMotion } from './articulatedMotion';
import { createLayeredRig, RIG_HEIGHT, RIG_WIDTH } from './layeredRig';
export type CharacterMode = 'idle' | 'listening' | 'speaking';
export type MouthShape = 'rest' | 'aa' | 'ee' | 'oh' | 'mm';
export interface CharacterCanvasProps {
  mode: CharacterMode;
  mouthOpen: number;
  /** Read every frame instead of mouthOpen, so a fast-changing level doesn't re-render the parent. */
  readMouthOpen?: () => number;
  mouthShape: MouthShape;
  gesture: number;
  reducedMotion?: boolean;
  shirtColor?: [number, number, number];
}
const ART = '/character/mira-approved.png';
export function CharacterCanvas(props: CharacterCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null),
    latest = useRef(props),
    pointer = useRef({ x: 0, y: 0 });
  latest.current = props;
  const [error, setError] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the rig reads props through latest and is rebuilt only when the shirt color changes
  useEffect(() => {
    const canvas = canvasRef.current,
      ctx = canvas?.getContext('2d', { alpha: true });
    if (!canvas || !ctx) {
      setError(true);
      return;
    }
    let disposed = false,
      raf = 0,
      observer: ResizeObserver | undefined;
    const image = new Image();
    image.onload = () => {
      if (disposed) return;
      try {
        const rig = createLayeredRig(image, latest.current.shirtColor),
          motion = new ArticulatedMotion();
        const resize = () => {
          const box = canvas.getBoundingClientRect(),
            dpr = Math.min(window.devicePixelRatio || 1, 2);
          canvas.width = Math.max(1, Math.round(box.width * dpr));
          canvas.height = Math.max(1, Math.round(box.height * dpr));
        };
        observer = new ResizeObserver(resize);
        observer.observe(canvas);
        resize();
        let last = performance.now(),
          time = 0,
          mouth = 0;
        const render = (now: number) => {
          if (disposed) return;
          raf = requestAnimationFrame(render);
          if (document.hidden) {
            last = now;
            return;
          }
          const dt = Math.min((now - last) / 1000, 0.05);
          last = now;
          time += dt;
          const state = latest.current;
          const pose = motion.update(time, dt, {
            mode: state.mode,
            gesture: state.gesture,
            pointerX: pointer.current.x,
            pointerY: pointer.current.y,
            reduced: !!state.reducedMotion,
          });
          const target = state.readMouthOpen ? state.readMouthOpen() : state.mouthOpen;
          mouth += (Math.max(0, Math.min(1, target)) - mouth) * (1 - Math.exp(-dt * 24));
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          const scale = Math.min(canvas.width / RIG_WIDTH, canvas.height / RIG_HEIGHT);
          ctx.setTransform(
            scale,
            0,
            0,
            scale,
            (canvas.width - RIG_WIDTH * scale) / 2,
            (canvas.height - RIG_HEIGHT * scale) / 2,
          );
          rig.draw(ctx, pose, mouth, state.mouthShape);
        };
        raf = requestAnimationFrame(render);
      } catch (err) {
        console.error('Character renderer:', err);
        setError(true);
      }
    };
    image.onerror = () => {
      if (!disposed) setError(true);
    };
    image.src = ART;
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      observer?.disconnect();
      image.onload = null;
      image.onerror = null;
    };
  }, [props.shirtColor?.join(',')]);
  return error ? (
    <img src={ART} alt="Mira, your interviewer" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
  ) : (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={`Mira, ${props.mode}`}
      style={{ width: '100%', height: '100%', display: 'block' }}
      onPointerMove={(e) => {
        const b = e.currentTarget.getBoundingClientRect();
        pointer.current = {
          x: Math.max(-1, Math.min(1, ((e.clientX - b.left) / b.width) * 2 - 1)),
          y: Math.max(-1, Math.min(1, ((e.clientY - b.top) / b.height) * 2 - 1)),
        };
      }}
      onPointerLeave={() => {
        pointer.current = { x: 0, y: 0 };
      }}
    />
  );
}
export default CharacterCanvas;
