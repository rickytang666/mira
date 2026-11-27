import { useEffect, useState } from 'react';
import type { ReportLoader, StudyReport } from '../agent/internalTypes';

/** Non-overlapping polls, cancelled on study change/unmount; retains data on transient errors. */
export function useReport(studyId: string, loadReport?: ReportLoader, pollMs = 5000) {
  const [state, setState] = useState<{ studyId: string; report?: StudyReport; loading: boolean; error: string }>({
    studyId,
    loading: !!loadReport,
    error: '',
  });
  const [revision, setRevision] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: revision changes only to force a refresh
  useEffect(() => {
    if (!loadReport) return;
    const load = loadReport;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    setState((previous) => ({
      studyId,
      report: previous.studyId === studyId ? previous.report : undefined,
      loading: true,
      error: '',
    }));
    async function refresh() {
      try {
        const report = await load(studyId, controller.signal);
        if (report.studyId !== studyId) throw new Error('Received a report for a different study.');
        if (!disposed) setState({ studyId, report, loading: false, error: '' });
      } catch (error) {
        if (!disposed)
          setState((previous) => ({
            ...previous,
            loading: false,
            error: error instanceof Error ? error.message : 'Could not refresh the report.',
          }));
      } finally {
        if (!disposed) timer = setTimeout(refresh, Math.max(1000, pollMs));
      }
    }
    void refresh();
    return () => {
      disposed = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [studyId, loadReport, pollMs, revision]);
  return {
    ...(state.studyId === studyId ? state : { studyId, loading: true, error: '', report: undefined }),
    refresh: () => setRevision((n) => n + 1),
  };
}
