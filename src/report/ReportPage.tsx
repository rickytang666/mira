import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery, getReport, getStudy, regenerateStudyReport } from 'wasp/client/operations';
import { Layout } from '../Layout';
import { ReportContent } from './ReportContent';
import { fromReportView } from './fromReportView';

export function ReportPage() {
  const { studyId = '' } = useParams();
  const { data: report, error: loadError, refetch } = useQuery(getReport, { studyId }, { refetchInterval: 5000 });
  const { data: study } = useQuery(getStudy, { studyId });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function regenerate() {
    setBusy(true); setError('');
    try { await regenerateStudyReport({ studyId }); await refetch(); }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not update the report.'); }
    finally { setBusy(false); }
  }
  return <Layout page="report" sourceCount={study?.sources.length ?? 0} questionCount={study?.questions.length ?? 0}>
    {loadError && <div className="fw-notice" role="alert">Could not load the report. <button onClick={() => void refetch()}>Retry</button></div>}
    {!report ? <div className="fw-empty" role="status">Loading interview evidence…</div> : <ReportContent
      report={fromReportView(report)}
      actions={<button className="fw-button fw-button-primary" disabled={busy || !report.interviewsDone} onClick={regenerate}>{busy ? 'Updating report…' : 'Update report'}</button>}
      beforeContent={<>
        {(error || report.synthesisError) && <div className="fw-notice" role="alert">{error || report.synthesisError} Your saved conversations are safe; retry with Update report.</div>}
        {(busy || report.synthesisStatus === 'processing') && <p className="fw-notice" role="status">Mira is analyzing the latest interviews. This page updates on its own.</p>}
        {!busy && report.synthesisStatus === 'waiting' && report.interviewsDone > 0 && <p className="fw-notice" role="status">Mira is analyzing the latest interviews. This page updates on its own.</p>}
      </>}
      emptyAction={<Link className="fw-button" to={`/study/${studyId}/questionnaire`}>Review interview questions ↗</Link>}
    />}
  </Layout>;
}
