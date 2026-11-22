import type { InterviewResult, ReportTheme, StudyReport } from '../agent/internalTypes';

const keyOf = (label: string) => label.trim().toLocaleLowerCase('en').replace(/\s+/g, ' ');

/** Pure adapter usable by getReport or fixtures; deduplicates retries by interview ID. */
export function buildReport(study: { id: string; name: string; goal: string }, interviews: InterviewResult[], updatedAt = new Date().toISOString()): StudyReport {
  const unique = [...new Map(interviews.map(interview => [interview.id, interview])).values()];
  const themes = new Map<string, ReportTheme>();
  for (const [index, interview] of unique.entries()) {
    if (interview.status !== 'done' || !interview.synthesis) continue;
    const counted = new Set<string>();
    for (const theme of interview.synthesis.themes) {
      const key = keyOf(theme.label);
      let group = themes.get(key);
      if (!group) {
        group = { id: key, label: theme.label, summary: theme.summary, count: 0, quotes: [] };
        themes.set(key, group);
      }
      if (!counted.has(key)) { group.count++; counted.add(key); }
      for (const quote of theme.quotes) {
        const id = `${interview.id}:${quote.turnId}`;
        if (group.quotes.some(q => q.id === id)) continue;
        group.quotes.push({ ...quote, id, interviewId: interview.id, participantLabel: interview.participantLabel ?? `Participant ${index + 1}`, audioUrl: interview.audioUrl ?? null });
      }
    }
  }
  return { studyId: study.id, productName: study.name, goal: study.goal,
    completedCount: unique.filter(i => i.status === 'done').length,
    processingCount: unique.filter(i => i.status === 'processing').length,
    failedCount: unique.filter(i => i.status === 'failed').length,
    themes: [...themes.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)), updatedAt,
  };
}
