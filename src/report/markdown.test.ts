import { describe, expect, it } from 'vitest';
import { sampleReportView } from './fixtures';
import { fromReportView } from './fromReportView';
import { toMarkdown } from './markdown';

const sample = fromReportView(sampleReportView);

function withQuote(text: string, overrides: Partial<(typeof sample.themes)[number]['quotes'][number]> = {}) {
  const [theme] = sample.themes;
  return {
    ...sample,
    summary: undefined,
    questionFindings: undefined,
    recommendations: undefined,
    themes: [{ ...theme, summary: '', quotes: [{ ...theme.quotes[0], text, ...overrides }] }],
  };
}

describe('toMarkdown', () => {
  it('orders the summary, themes, findings and next steps', () => {
    const md = toMarkdown(sample);
    const order = [
      '# Mira',
      '## Summary',
      '## Themes',
      '### Setup needs a clearer next step',
      '### Spreadsheets fill the gaps',
      '## By question',
      '## Next steps',
    ].map((heading) => md.indexOf(`${heading}\n`));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(md).toContain('*3 of 3 interviews*');
    expect(md).toContain('**Partly answered**');
    expect(md).toContain(
      '1. Test a guided setup example that shows the exact permissions required for the first integration.',
    );
  });

  it('renders each quote as a block with the participant and m:ss timestamp', () => {
    const md = toMarkdown(sample);
    expect(md).toContain(
      '> I got stuck connecting my API key. I could not tell which permissions it needed.\n>\n> *Participant 01, 0:05*',
    );
    expect(md).toContain('> *Participant 03, 0:33*');
    expect(md.match(/^> \*Participant/gm)).toHaveLength(5);
  });

  it('formats long timestamps as minutes and omits them for untimed quotes', () => {
    expect(toMarkdown(withQuote('Long call.', { startSec: 3725.9 }))).toContain('> *Participant 01, 62:05*');
    expect(toMarkdown(withQuote('Pasted note.', { startSec: null }))).toContain('> *Participant 01*\n');
  });

  it('never includes audio links', () => {
    const md = toMarkdown(withQuote('Hello.', { audioUrl: 'https://abc.trycloudflare.com/audio/interview-1' }));
    expect(md).not.toContain('trycloudflare');
    expect(md).not.toContain('/audio/');
  });

  it('escapes Markdown characters in quote text', () => {
    const md = toMarkdown(withQuote('I *loved* the [beta] `cli` and my_var <b>~~ok~~ \\ done'));
    expect(md).toContain('> I \\*loved\\* the \\[beta\\] \\`cli\\` and my\\_var \\<b>\\~\\~ok\\~\\~ \\\\ done');
  });

  it('escapes block syntax at the start of quote lines and keeps line breaks inside the block', () => {
    const md = toMarkdown(withQuote('# not a heading\n- not a list\n> not nested\n2. not ordered\n\n=== nope'));
    expect(md).toContain(
      '> \\# not a heading\n> \\- not a list\n> \\> not nested\n> 2\\. not ordered\n>\n> \\=== nope',
    );
  });

  it('keeps indented quote lines out of code blocks', () => {
    const md = toMarkdown(withQuote('First line\n    indented line\n\t# tabbed heading'));
    expect(md).toContain('> First line\n> indented line\n> \\# tabbed heading');
  });

  it('keeps headings on one line and escapes them', () => {
    const report = { ...sample, themes: [{ ...sample.themes[0], label: 'Pricing\n*feels* off' }] };
    expect(toMarkdown(report)).toContain('### Pricing \\*feels\\* off\n');
  });

  it('skips empty sections', () => {
    const md = toMarkdown({ ...sample, summary: '', themes: [], questionFindings: [], recommendations: [] });
    expect(md).toBe(`# Mira\n\n${sample.goal}\n`);
  });
});
