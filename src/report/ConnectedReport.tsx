import { useCallback, useMemo } from 'react';
import type { ReportView } from '../contract';
import { ReportContent } from './ReportContent';
import { fromReportView } from './fromReportView';

export type ReportViewLoader = (studyId: string, signal: AbortSignal) => Promise<ReportView>;
export type ConnectedReportProps = {
  studyId: string;
  productName?: string;
  report?: ReportView;
  loadReport?: ReportViewLoader;
};

/** Mount with Wasp query data OR a stable getReport loader; accepts the exact team contract. */
export function ConnectedReport({ studyId, productName, report, loadReport }: ConnectedReportProps) {
  const adapted = useMemo(() => report ? fromReportView(report, productName) : undefined, [report, productName]);
  const load = useCallback(async (id: string, signal: AbortSignal) => fromReportView(await loadReport!(id, signal), productName), [loadReport, productName]);
  return <ReportContent studyId={studyId} report={adapted} loadReport={loadReport ? load : undefined}/>;
}
