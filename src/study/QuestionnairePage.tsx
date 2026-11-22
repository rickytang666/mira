import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowDown, ArrowUp, Check, Loader2, Plus, Trash2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useQuery, getStudy, updateStudy, generateStudyQuestions } from 'wasp/client/operations';
import { Layout, PageHeader, ErrorNote } from '../Layout';
import { LogoUploader } from './LogoUploader';
import './LogoUploader.css';

type DraftQuestion = { key: string; text: string; followUp: boolean };
const newKey = () => crypto.randomUUID();

export function QuestionnairePage() {
  const { studyId = '' } = useParams();
  const { data: study, error: loadError, isLoading } = useQuery(getStudy, { studyId });
  const [goal, setGoal] = useState('');
  const [audience, setAudience] = useState('');
  const [questions, setQuestions] = useState<DraftQuestion[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!study || dirty) return;
    setGoal(study.goal);
    setAudience(study.audience);
    setQuestions(study.questions.map((q) => ({ key: q.id, text: q.text, followUp: q.followUp })));
  }, [study, dirty]);

  function edit(next: DraftQuestion[]) { setQuestions(next); setDirty(true); }
  function move(index: number, by: number) {
    const next = [...questions];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    edit(next);
  }
  async function save() {
    setSaving(true);
    setError('');
    try {
      await updateStudy({ studyId, goal, audience, questions: questions.map(({ text, followUp }) => ({ text, followUp })) });
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  async function generate() {
    setGenerating(true);
    setError('');
    try {
      const result = await generateStudyQuestions({ studyId, goal, audience });
      edit(result.questions.map(text => ({ key: newKey(), text, followUp: true })));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate questions. Your existing questions are unchanged.');
    } finally { setGenerating(false); }
  }

  const interviewUrl = `${window.location.origin}/i/${studyId}`;
  if (isLoading) return <Layout page="questionnaire" sourceCount={0} questionCount={0}><Loader2 className="spin" /></Layout>;
  if (loadError || !study) return <Layout page="questionnaire" sourceCount={0} questionCount={0}><ErrorNote message="Study not found." /></Layout>;

  return (
    <Layout page="questionnaire" sourceCount={study.sources.length} questionCount={questions.length}>
      <PageHeader
        title="Interview questions"
        description="Mira asks these in order and follows up on her own."
        action={dirty
          ? <button className="button primary" disabled={saving || generating} onClick={save}>{saving ? <Loader2 size={15} className="spin" /> : <Check size={15} />}Save changes</button>
          : undefined}
      />
      <ErrorNote message={error} />
      {dirty && <p className="saved">Save your changes before sharing. Interviews use the saved questions.</p>}
      <section className="form-panel">
        <div className="panel-heading"><h2>Share the interview</h2></div>
        <div className="form-content" style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
          <QRCodeSVG value={interviewUrl} size={168} />
          <div>
            <p>Participants scan this to start a one-minute voice interview. No sign-up.</p>
            <a className="text-link" href={interviewUrl} target="_blank" rel="noreferrer">{interviewUrl}</a>
          </div>
          <LogoUploader studyId={studyId} logo={study.logo ?? null} />
        </div>
      </section>
      <section className="form-panel">
        <div className="panel-heading"><h2>Goal and audience</h2></div>
        <div className="form-content">
          <label className="field">Research goal<textarea readOnly={generating || saving} rows={3} value={goal} onChange={(e) => { setGoal(e.target.value); setDirty(true); }} /></label>
          <label className="field">Who are you talking to?<input readOnly={generating || saving} value={audience} onChange={(e) => { setAudience(e.target.value); setDirty(true); }} placeholder="e.g. First-time users who signed up this week" /></label>
        </div>
      </section>
      <section className="form-panel questions-panel">
        <div className="panel-heading"><h2>Questions</h2><button className="button secondary" disabled={generating || saving || !goal.trim()} onClick={generate}>{generating ? <><Loader2 size={15} className="spin" />Writing questions…</> : "Generate new questions"}</button></div>
        <div className="questions-list">
          {questions.length === 0 ? (
            <div className="empty-questions"><h3>No questions yet</h3><p>Add one below.</p></div>
          ) : questions.map((question, index) => (
            <div className="question-row" key={question.key}>
              <span className="question-index">{index + 1}</span>
              <div className="question-body">
                <textarea readOnly={generating || saving} aria-label={`Question ${index + 1}`} rows={2} value={question.text} onChange={(e) => edit(questions.map((q) => q.key === question.key ? { ...q, text: e.target.value } : q))} placeholder="Ask an open-ended question…" />
                <label className="checkbox-label"><input disabled={generating || saving} type="checkbox" checked={question.followUp} onChange={(e) => edit(questions.map((q) => q.key === question.key ? { ...q, followUp: e.target.checked } : q))} />Allow natural follow-ups</label>
              </div>
              <div className="question-controls">
                <button className="icon-button" disabled={generating || saving || index === 0} aria-label="Move question up" onClick={() => move(index, -1)}><ArrowUp size={15} /></button>
                <button className="icon-button" disabled={generating || saving || index === questions.length - 1} aria-label="Move question down" onClick={() => move(index, 1)}><ArrowDown size={15} /></button>
                <button className="icon-button delete" disabled={generating || saving} aria-label={`Delete question ${index + 1}`} onClick={() => edit(questions.filter((q) => q.key !== question.key))}><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
        </div>
        <button className="add-question" disabled={generating || saving} onClick={() => edit([...questions, { key: newKey(), text: '', followUp: true }])}><Plus size={16} />Add a question</button>
      </section>
      <div className="page-bottom">
        <Link to="/" className="text-link">All studies</Link>
        <Link className="button primary" to={`/study/${studyId}/report`}>View the report</Link>
      </div>
    </Layout>
  );
}
