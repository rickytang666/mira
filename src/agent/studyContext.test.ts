import { describe, expect, it, vi } from 'vitest';
import { interviewVariables, questionGenerationInput, snapshotStudy } from './studyContext';
import { synthesizeStudy, type StudyCall } from './synthesizeStudy';
import type { JsonRequest } from './llm';

const workspace = () => ({ name: 'Fieldwork', goal: 'Improve setup', audience: 'Founders', sources: [{ title: 'Product guide', content: 'Connect your first integration.' }], questions: [{ id: 'q1', text: ' Where did you get stuck? ', followUp: false }] });
const call: StudyCall = { interviewId: 'i1', title: 'Participant 01', questions: ['What happened during setup?'], audioUrl: '/api/interviews/i1/audio', conversation: { conversationId: 'c1', status: 'done', durationSecs: 20, turns: [{ role: 'agent', text: 'What happened during setup?', timeInCallSecs: 0 }, { role: 'user', text: 'I could not find the settings.', timeInCallSecs: 5 }] } };

describe('study context and automatic call synthesis', () => {
  it('snapshots edited questions and knowledge for both generation and the voice agent', () => {
    const source = workspace();
    const study = snapshotStudy('s1', source);
    source.questions[0].text = 'Changed after the call';
    expect(study.questions[0].text).toBe('Where did you get stuck?');
    expect(questionGenerationInput(study)).toMatchObject({ audience: 'Founders', context: 'Product guide\nConnect your first integration.' });
    expect(interviewVariables(study)).toMatchObject({ study_id: 's1', questions: '1. Where did you get stuck? [Do not ask a follow-up for this question.]', product_context: study.context });
  });
  it('uses fetched calls, retains historical questions, and attaches the recording to exact evidence', async () => {
    const generateJson = vi.fn(async (_request: JsonRequest) => ({ summary: 'Settings were difficult to find.', themes: [{ label: 'Settings discovery', summary: 'One participant could not find settings.', evidence: [{ callId: 'i1', turnId: 'turn-1' }] }], recommendations: [{ text: 'Test a visible settings link.', themeLabels: ['Settings discovery'] }], questionFindings: [{ questionIndex: 0, status: 'partial', finding: 'Settings discovery blocked one participant.', themeLabels: ['Settings discovery'] }] }));
    const pending: StudyCall = { ...call, interviewId: 'i2', conversation: { ...call.conversation, conversationId: 'c2', status: 'processing' } };
    const report = await synthesizeStudy(snapshotStudy('s1', workspace()), [call, call, pending], { generateJson });
    expect(generateJson).toHaveBeenCalledOnce();
    expect(generateJson.mock.calls[0][0].input).toMatchObject({ productContext: 'Product guide\nConnect your first integration.', audience: 'Founders', questions: ['Where did you get stuck?'], calls: [{ id: 'i1', questions: ['What happened during setup?'] }] });
    expect(report).toMatchObject({ interviewsDone: 1, interviewsProcessing: 1, questionFindings: [{ question: 'Where did you get stuck?', status: 'partial' }] });
    expect(report.themes[0].quotes[0]).toMatchObject({ text: 'I could not find the settings.', startSec: 5, endSec: 20, audioUrl: call.audioUrl });
  });
  it('does not spend an AI request while all calls are processing', async () => {
    const generateJson = vi.fn();
    const report = await synthesizeStudy(snapshotStudy('s1', workspace()), [{ ...call, conversation: { ...call.conversation, status: 'processing' } }], { generateJson });
    expect(generateJson).not.toHaveBeenCalled();
    expect(report).toMatchObject({ interviewsDone: 0, interviewsProcessing: 1, themes: [] });
  });
});
