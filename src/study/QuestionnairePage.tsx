import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowDown, ArrowRight, ArrowUp, Check, Loader2, MessageSquare, Plus, Trash2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useQuery, getStudy, updateStudy } from 'wasp/client/operations';
import { Layout, PageHeader, ErrorNote } from '../Layout';

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

  const interviewUrl = `${window.location.origin}/i/${studyId}`;
  if (isLoading) return <Layout page="questionnaire" sourceCount={0} questionCount={0}><Loader2 className="spin" /></Layout>;
  if (loadError || !study) return <Layout page="questionnaire" sourceCount={0} questionCount={0}><ErrorNote message="Study not found." /></Layout>;

  return (
    <Layout page="questionnaire" sourceCount={0} questionCount={questions.length}>
      <PageHeader
        eyebrow={`02 / ${study.name.toUpperCase()}`}
        title="What would you like to learn?"
        description="The interviewer asks these questions and follows up on its own."
        action={dirty
          ? <button className="button primary" disabled={saving} onClick={save}>{saving ? <Loader2 size={15} className="spin" /> : <Check size={15} />}Save changes</button>
          : <span className="saved"><Check size={14} />Saved</span>}
      />
      <ErrorNote message={error} />
      <section className="form-panel">
        <div className="panel-heading"><h2>Share the interview</h2><span className="quiet-pill"><span className="live-dot" />Live</span></div>
        <div className="form-content" style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
          <QRCodeSVG value={interviewUrl} size={168} />
          <div>
            <p>Scan with a phone to start a one-minute voice interview. No sign-up.</p>
            <a className="text-link" href={interviewUrl} target="_blank" rel="noreferrer">{interviewUrl}</a>
          </div>
        </div>
      </section>
      <section className="form-panel">
        <div className="panel-heading"><h2>Give the conversation a direction</h2><span className="number-tag">01</span></div>
        <div className="form-content">
          <label className="field">Research goal<textarea rows={3} value={goal} onChange={(e) => { setGoal(e.target.value); setDirty(true); }} /></label>
          <label className="field">Who are you talking to?<input value={audience} onChange={(e) => { setAudience(e.target.value); setDirty(true); }} placeholder="e.g. First-time users who signed up this week" /></label>
        </div>
      </section>
      <section className="form-panel questions-panel">
        <div className="panel-heading"><h2>Interview questions <span className="number-tag">{questions.length}</span></h2></div>
        <div className="questions-list">
          {questions.length === 0 ? (
            <div className="empty-questions"><MessageSquare size={25} /><h3>Every insight starts with a question.</h3><p>Add one below.</p></div>
          ) : questions.map((question, index) => (
            <div className="question-row" key={question.key}>
              <span className="question-index">{String(index + 1).padStart(2, '0')}</span>
              <div className="question-body">
                <textarea aria-label={`Question ${index + 1}`} rows={2} value={question.text} onChange={(e) => edit(questions.map((q) => q.key === question.key ? { ...q, text: e.target.value } : q))} placeholder="Ask an open-ended question…" />
                <label className="checkbox-label"><input type="checkbox" checked={question.followUp} onChange={(e) => edit(questions.map((q) => q.key === question.key ? { ...q, followUp: e.target.checked } : q))} />Allow natural follow-ups</label>
              </div>
              <div className="question-controls">
                <button className="icon-button" disabled={index === 0} aria-label="Move question up" onClick={() => move(index, -1)}><ArrowUp size={15} /></button>
                <button className="icon-button" disabled={index === questions.length - 1} aria-label="Move question down" onClick={() => move(index, 1)}><ArrowDown size={15} /></button>
                <button className="icon-button delete" aria-label={`Delete question ${index + 1}`} onClick={() => edit(questions.filter((q) => q.key !== question.key))}><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
        </div>
        <button className="add-question" onClick={() => edit([...questions, { key: newKey(), text: '', followUp: true }])}><Plus size={16} />Add a question</button>
      </section>
      <div className="page-bottom">
        <Link to="/" className="text-link">All studies</Link>
        <Link className="button primary" to={`/study/${studyId}/report`}>View the report<ArrowRight size={16} /></Link>
      </div>
    </Layout>
  );
}
