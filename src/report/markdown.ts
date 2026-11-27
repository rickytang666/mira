import type { StudyReport } from '../agent/internalTypes';

const statusLabels = { answered: 'Answered', partial: 'Partly answered', unanswered: 'Still open' } as const;

const formatTimestamp = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

// Escapes inline syntax anywhere and block syntax (headings, quotes, lists) only at a line start.
function escapeLine(line: string): string {
  return line
    .replace(/[\\`*_[\]<~]/g, '\\$&')
    .replace(/^[#>+=-]/, '\\$&')
    .replace(/^(\d+)([.)])/, '$1\\$2');
}

// Lines are trimmed so an indented line can't turn into a code block.
const escapeBlock = (text: string) =>
  text
    .trim()
    .split(/\r?\n/)
    .map((line) => escapeLine(line.trim()))
    .join('\n');
const escapeInline = (text: string) => escapeLine(text.trim().replace(/\s+/g, ' '));

function quoteBlock(quote: StudyReport['themes'][number]['quotes'][number]): string {
  const body = escapeBlock(quote.text)
    .split('\n')
    .map((line) => (line ? `> ${line}` : '>'))
    .join('\n');
  const time = quote.startSec === null ? '' : `, ${formatTimestamp(quote.startSec)}`;
  return `${body}\n>\n> *${escapeInline(quote.participantLabel)}${time}*`;
}

/** Audio links are left out: they point at a local server through a tunnel URL that changes. */
export function toMarkdown(report: StudyReport): string {
  const blocks: string[] = [`# ${escapeInline(report.productName || 'Report')}`];
  if (report.goal.trim()) blocks.push(escapeBlock(report.goal));
  if (report.summary?.trim()) blocks.push('## Summary', escapeBlock(report.summary));
  const themes = [...report.themes].sort((a, b) => b.count - a.count);
  if (themes.length) blocks.push('## Themes');
  for (const theme of themes) {
    const interviews = theme.count === 1 && report.completedCount === 1 ? 'interview' : 'interviews';
    blocks.push(`### ${escapeInline(theme.label)}`, `*${theme.count} of ${report.completedCount} ${interviews}*`);
    if (theme.summary.trim()) blocks.push(escapeBlock(theme.summary));
    blocks.push(...theme.quotes.map(quoteBlock));
  }
  if (report.questionFindings?.length) {
    blocks.push('## By question');
    for (const item of report.questionFindings) {
      blocks.push(`### ${escapeInline(item.question)}`, `**${statusLabels[item.status]}**`);
      if (item.finding.trim()) blocks.push(escapeBlock(item.finding));
    }
  }
  if (report.recommendations?.length) {
    blocks.push(
      '## Next steps',
      report.recommendations.map((item, index) => `${index + 1}. ${escapeInline(item.text)}`).join('\n'),
    );
  }
  return `${blocks.join('\n\n')}\n`;
}
