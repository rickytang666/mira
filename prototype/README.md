# Character prototype

Run from the repository root:

```sh
npm run avatar:dev
```

Open http://localhost:3004. The port is strict. `npm run avatar:build` builds into `.avatar-preview/`. The preview is independent of the Wasp dashboard and voice integration.

## Animation

`CharacterCanvas.tsx` renders the approved `public/character/mira-approved.png` with cached Canvas 2D illustration layers. `layeredRig.ts` separates the head, torso, upper arms, forearms and hands. Shoulder, elbow and wrist rotations are nested, with reconstructed clothing behind the arms. The illustration and hand shapes are preserved; this is a prototype cutout rig, not a full Live2D model or arbitrary hand-pose generator.

`articulatedMotion.ts` provides four gestures with eased anticipation, holds and damped settling. Gestures play occasionally at rest, more frequently during speech, and on demand when tapping the character or hand control. Head motion responds to the pointer and listening state. Blinks use fast close / brief hold / slower open eyelids over fixed eyes, preserving the glasses. Breathing stays subtle.

The renderer accepts `mode` (`idle`, `listening`, `speaking`), `mouthOpen` (0–1), `mouthShape` (`rest`, `aa`, `ee`, `oh`, `mm`), `gesture` (increment to gesture), and `reducedMotion`. Its logical aspect ratio is 1180 / 1580. The mobile preview shows the character waist-up with four small controls: listening pose, gesture, sample speech, and mute.

`useDemoSpeech.ts` uses browser voice and approximate text mouth timing, anchored to word boundaries where available. Mute runs a silent text timeline. This is not ElevenLabs or phoneme-accurate lip sync, and no microphone is recorded. The team's voice integration can feed the renderer directly.

Reduced motion disables idle movement, blinking and gestures. Rendering pauses while the tab is hidden, DPR is capped at 2, and sprites are prepared only once. Animation callbacks and speech sessions are cleaned up on unmount. A static portrait is shown if Canvas initialization fails.

## Checks

Run the character Vitest tests and `npm run avatar:build` for the isolated preview. The repository's Wasp validation remains `wasp compile`; do not run `tsc` directly. If a teammate's Wasp process owns the project lock, leave it running.
