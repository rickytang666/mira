import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { GenerateReportInput, ReportView } from '../../contract';
import { ReportWorkspace } from '../ReportWorkspace';
import { ReportContent } from '../ReportContent';
import { fromReportView } from '../fromReportView';
import { sampleReportView } from '../fixtures';

async function generateReport(input: GenerateReportInput): Promise<ReportView> {
  const response = await fetch('/api/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Could not generate the report.');
  return body;
}

function Preview() {
  const [testTools, setTestTools] = useState(false);
  return <>
    <header style={{ maxWidth: 1080, padding: '24px 20px 18px', margin: 'auto', font: '12px system-ui', borderBottom: '1px solid #eae5ef', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><strong style={{ color: '#605372', fontSize: 22, letterSpacing: -1 }}>Mira</strong><button className="fw-text-button" onClick={() => setTestTools(value => !value)}>{testTools ? 'Back to report preview' : 'Developer test tools'}</button></header>
    {testTools ? <ReportWorkspace studyId="preview-report" productName="Mira" goal="Understand what gets in the way of a successful first experience." generateReport={generateReport}/>
      : <ReportContent report={fromReportView(sampleReportView)} sample/>}
  </>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Preview/></React.StrictMode>);
