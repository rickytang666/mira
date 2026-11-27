import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Loader2 } from 'lucide-react';
import { useQuery, createStudy, getStudies } from 'wasp/client/operations';
import { Layout, PageHeader, ErrorNote } from '../Layout';

export function NewStudyPage() {
  const navigate = useNavigate();
  const { data: studies } = useQuery(getStudies);
  const [productUrl, setProductUrl] = useState('');
  const [goal, setGoal] = useState('');
  const [description, setDescription] = useState('');
  const [showDescription, setShowDescription] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { id } = await createStudy({ productUrl, goal, description });
      navigate(`/study/${id}/questionnaire`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the study.');
      if (!description) setShowDescription(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Layout page="studies" sourceCount={0} questionCount={0}>
      <PageHeader
        title="New study"
        description="Mira reads your site, writes the interview, talks to each user for a minute, and reports back in their words."
      />
      <form className="form-panel" onSubmit={submit}>
        <div className="form-content">
          <ErrorNote message={error} />
          <label className="field">
            Product URL
            <input
              autoFocus
              value={productUrl}
              onChange={(e) => setProductUrl(e.target.value)}
              placeholder="https://your-product.com"
            />
          </label>
          <label className="field">
            What do you want to learn?
            <textarea
              required
              rows={3}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="e.g. Why new users leave before finishing onboarding."
            />
          </label>
          {showDescription ? (
            <label className="field">
              Describe your product <span>(used when the site can't be read)</span>
              <textarea
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does it do, and who is it for?"
              />
            </label>
          ) : (
            <button type="button" className="text-link" onClick={() => setShowDescription(true)}>
              No website? Describe it instead
            </button>
          )}
          <div className="modal-actions">
            <button
              className="button primary"
              disabled={busy || !goal.trim() || (!productUrl.trim() && !description.trim())}
            >
              {busy ? (
                <>
                  <Loader2 size={16} className="spin" />
                  Writing your questions…
                </>
              ) : (
                <>Create study</>
              )}
            </button>
          </div>
        </div>
      </form>
      {studies && studies.length > 0 && (
        <section className="form-panel">
          <div className="panel-heading">
            <h2>Your studies</h2>
          </div>
          <div className="form-content">
            {studies.map((study) => (
              <div className="channel-row" key={study.id}>
                <div>
                  <strong>{study.name}</strong>
                  <small>{study.goal}</small>
                </div>
                <Link className="text-link" to={`/study/${study.id}/report`}>
                  Report
                </Link>
                <Link className="text-link" to={`/study/${study.id}/questionnaire`}>
                  Questions
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}
    </Layout>
  );
}
