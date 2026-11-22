// Placeholder until track 4 ships src/character/. The contract is one prop: `speaking`.
// To swap: replace the import of VoiceOrb in InterviewPage.tsx with the track 4 component.
export function VoiceOrb({ speaking, live }: { speaking: boolean; live?: boolean }) {
  return (
    <div className={`orb ${live ? 'live' : ''} ${speaking ? 'speaking' : ''}`} aria-hidden="true">
      <span className="orb-ring" />
      <span className="orb-ring delay" />
      <span className="orb-core" />
    </div>
  );
}
