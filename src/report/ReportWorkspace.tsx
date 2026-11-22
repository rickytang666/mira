import { useEffect, useMemo, useRef, useState } from 'react';
import type { GenerateReportInput, ReportView } from '../contract';
import { ReportContent } from './ReportContent';
import { fromReportView } from './fromReportView';
import { sampleReportView } from './fixtures';

type Call = GenerateReportInput['calls'][number];
type Saved = { calls: Call[]; report: ReportView | null };
export interface ReportWorkspaceProps {
  studyId: string;
  productName: string;
  goal: string;
  generateReport: (input: GenerateReportInput) => Promise<ReportView>;
}

function restore(key: string): Saved {
  try {
    const data = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (data?.version !== 1 || !Array.isArray(data.calls) || data.calls.length > 10 || !data.calls.every((call: Call) => typeof call.id === 'string' && typeof call.title === 'string' && typeof call.transcript === 'string')) return { calls: [], report: null };
    const report = data.report && Array.isArray(data.report.themes) && typeof data.report.studyId === 'string' ? data.report : null;
    return { calls: data.calls, report };
  } catch { return { calls: [], report: null }; }
}

/** Complete transcript-to-report flow. The caller supplies a Wasp action or a saved-call adapter. */
export function ReportWorkspace({ studyId, productName, goal, generateReport }: ReportWorkspaceProps) {
  const storageKey = `fieldwork.report.v1:${studyId}`;
  const [saved, setSaved] = useState<Saved>(() => restore(storageKey));
  const [showExample, setShowExample] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [title, setTitle] = useState('');
  const [transcript, setTranscript] = useState('');
  const [formError, setFormError] = useState('');
  const [recording, setRecording] = useState<File | null>(null);
  const [audioRevision, setAudioRevision] = useState(0);
  const audio = useRef(new Map<string, string>());
  const dialog = useRef<HTMLDialogElement>(null);
  const alive = useRef(true);
  const fileInput = useRef<HTMLInputElement>(null);
  const mountedKey = useRef(storageKey);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; for (const url of audio.current.values()) URL.revokeObjectURL(url); };
  }, []);
  useEffect(() => {
    // Parent keys this component by study ID; never persist one study into another.
    if (storageKey !== mountedKey.current) return;
    try { localStorage.setItem(storageKey, JSON.stringify({ version: 1, ...saved })); setSaveError(''); }
    catch { setSaveError('Your report is available here, but this browser could not save it.'); }
  }, [storageKey, saved]);
  const view = showExample ? sampleReportView : saved.report;
  const report = useMemo(() => {
    const result = fromReportView(view ?? { studyId, productName, goal, interviewsDone: 0, interviewsProcessing: 0, themes: [] }, productName);
    if (!showExample) result.themes = result.themes.map(theme => ({ ...theme, quotes: theme.quotes.map(quote => ({ ...quote, audioUrl: audio.current.get(quote.interviewId) ?? quote.audioUrl })) }));
    return result;
  }, [view, productName, goal, studyId, showExample, audioRevision]);

  function openDialog() {
    setTitle(`Call ${saved.calls.length + 1}`); setTranscript(''); setFormError(''); setRecording(null);
    if (fileInput.current) fileInput.current.value = '';
    dialog.current?.showModal();
  }
  async function generate(calls: Call[]) {
    setBusy(true); setError(''); setShowExample(false);
    try {
      const report = await generateReport({ studyId, productName, goal, calls });
      if (alive.current) setSaved({ calls, report });
    } catch (error) {
      if (alive.current) setError(error instanceof Error ? error.message : 'Could not create the report. Your transcripts are still here; please try again.');
    } finally { if (alive.current) setBusy(false); }
  }
  function submit(event: React.FormEvent) {
    event.preventDefault();
    const text = transcript.trim();
    if (!text) { setFormError('Paste a transcript or choose a text file.'); return; }
    if (saved.calls.some(call => call.transcript.trim() === text)) { setFormError('This transcript has already been added.'); return; }
    if (saved.calls.length >= 10 || saved.calls.reduce((sum, call) => sum + call.transcript.length, text.length) > 100_000) { setFormError('This report supports up to 10 calls and 100,000 transcript characters.'); return; }
    const call = { id: crypto.randomUUID(), title: title.trim() || `Call ${saved.calls.length + 1}`, transcript: text };
    if (recording) { audio.current.set(call.id, URL.createObjectURL(recording)); setAudioRevision(n => n + 1); }
    const calls = [...saved.calls, call];
    setSaved(previous => ({ ...previous, calls }));
    dialog.current?.close();
    void generate(calls);
  }
  async function importFile(file?: File) {
    if (!file) return;
    if (file.size > 500_000) { setFormError('Choose a transcript smaller than 500 KB.'); return; }
    try { setTranscript(await file.text()); setFormError(''); if (!title || /^Call \d+$/.test(title)) setTitle(file.name.replace(/\.(txt|json)$/i, '')); }
    catch { setFormError('Could not read this file. Please paste the transcript instead.'); }
  }
  function remove(id: string) {
    const url = audio.current.get(id); if (url) URL.revokeObjectURL(url);
    audio.current.delete(id); setAudioRevision(n => n + 1);
    const calls = saved.calls.filter(call => call.id !== id);
    // Clear outdated evidence immediately; removed calls must not remain in the report.
    setSaved({ calls, report: null }); setShowExample(false); setError('');
    if (calls.length) void generate(calls);
  }
  return <div className="fw-workspace" aria-busy={busy}>
    <ReportContent report={report} sample={showExample}
      actions={<div className="fw-header-actions">{saved.calls.length > 0 && <button className="fw-button fw-button-quiet" disabled={busy} onClick={() => void generate(saved.calls)}>↻ Refresh report</button>}<button className="fw-button fw-button-primary" disabled={busy || saved.calls.length >= 10} onClick={openDialog}><span aria-hidden="true">＋</span> Add transcript</button></div>}
      beforeContent={<>
        {busy && <div className="fw-progress" role="status"><span className="fw-progress-mark"/><div><strong>Finding the story in your conversations</strong><span>Reading transcripts, connecting themes, and checking the quotes.</span></div></div>}
        {error && <div className="fw-notice" role="alert"><span>{saved.report ? 'Showing your last completed report. ' : ''}{error}</span><button disabled={busy} onClick={() => void generate(saved.calls)}>Try again</button></div>}
        {saveError && <p className="fw-notice" role="status">{saveError}</p>}
        {saved.report && saved.report.goal !== goal && !showExample && <p className="fw-notice">Your research goal changed. Refresh the report to analyze these calls against the new goal.</p>}
        {!busy && saved.report && saved.report.interviewsDone !== saved.calls.length && !showExample && <p className="fw-notice">Your newest transcripts are saved but are not included in this report yet. Refresh the report to include them.</p>}
      </>}
      emptyAction={<><button className="fw-button fw-button-primary" disabled={busy} onClick={openDialog}>Add your first transcript <span aria-hidden="true">↗</span></button><button className="fw-text-button" onClick={() => setShowExample(true)}>See an example report</button></>}/>
    {showExample && <div className="fw-example-note"><span>This is a fictional example. Your own report uses only the transcripts you add.</span><button className="fw-text-button" onClick={() => setShowExample(false)}>Back to your report</button></div>}
    {!showExample && saved.calls.length > 0 && <section className="fw-sources" aria-label="Source transcripts"><div className="fw-sources-heading"><div><p className="fw-eyebrow">THE SOURCE MATERIAL</p><h2>Every finding starts here.</h2></div><span>{saved.calls.length} {saved.calls.length === 1 ? 'transcript' : 'transcripts'} · saved in this browser</span></div>
      {saved.calls.map((call, index) => <details className="fw-source-row" key={call.id}><summary><span className="fw-source-number">{String(index + 1).padStart(2, '0')}</span><strong>{call.title}</strong><span>{audio.current.has(call.id) ? 'Recording attached' : 'Transcript'}</span></summary><pre>{call.transcript}</pre><div className="fw-source-actions"><label className="fw-text-button">Attach matching recording<input type="file" accept="audio/*" hidden onChange={event => { const file = event.target.files?.[0]; if (!file) return; const old = audio.current.get(call.id); if (old) URL.revokeObjectURL(old); audio.current.set(call.id, URL.createObjectURL(file)); setAudioRevision(n => n + 1); }}/></label><button className="fw-text-button fw-remove" disabled={busy} onClick={() => remove(call.id)}>Remove transcript</button></div></details>)}
    </section>}
    <dialog ref={dialog} className="fw-dialog" aria-labelledby="fw-dialog-title">
      <form onSubmit={submit}><div className="fw-dialog-heading"><div><p className="fw-eyebrow">FROM CONVERSATION TO CLARITY</p><h2 id="fw-dialog-title">Bring a conversation.</h2></div><button type="button" className="fw-close" aria-label="Close transcript dialog" onClick={() => dialog.current?.close()}>×</button></div><p className="fw-dialog-description">Add the call transcript. We’ll turn what your participant said into a concise, evidence-backed report.</p>
        <label className="fw-field">Call name<input autoFocus maxLength={120} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Alex · first-time customer"/></label>
        <div className="fw-field"><div className="fw-field-heading"><label htmlFor="fw-transcript">Transcript</label><label className="fw-text-button">Import .txt or .json<input type="file" accept=".txt,.json,text/plain,application/json" hidden onChange={e => void importFile(e.target.files?.[0])}/></label></div><textarea id="fw-transcript" rows={9} maxLength={100000} required value={transcript} onChange={e => setTranscript(e.target.value)} placeholder={'[00:00] Interviewer: What happened when you tried it?\n[00:05] Participant: I got stuck during setup…'}/><small>Paste text or an ElevenLabs transcript. Speaker labels keep the participant’s words separate; timestamps enable quote playback.</small></div>
        <label className="fw-recording-field">Matching recording <span>optional</span><input ref={fileInput} type="file" accept="audio/*" onChange={e => setRecording(e.target.files?.[0] ?? null)}/><small>Audio stays in this tab. Reattach it after refreshing to listen again.</small></label>
        {formError && <p role="alert" className="fw-error">{formError}</p>}
        <div className="fw-dialog-actions"><button type="button" className="fw-button fw-button-quiet" onClick={() => dialog.current?.close()}>Cancel</button><button className="fw-button fw-button-primary" disabled={!transcript.trim()}>Generate report <span aria-hidden="true">↗</span></button></div>
      </form>
    </dialog>
  </div>;
}
