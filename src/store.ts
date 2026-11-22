import { useEffect, useState } from 'react';

export type SourceKind = 'url' | 'description' | 'pdf' | 'mcp';
export type Source = { id: string; kind: SourceKind; title: string; content: string; detail: string; addedAt: string };
export type Question = { id: string; text: string; followUp: boolean };
export type Workspace = { name: string; sources: Source[]; goal: string; audience: string; questions: Question[] };
const key = 'fieldwork.workspace.v1';
const empty: Workspace = { name: 'My product', sources: [], goal: '', audience: '', questions: [] };

export function useWorkspace() {
  const [workspace, setWorkspace] = useState<Workspace>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(key) || 'null');
      return raw && Array.isArray(raw.sources) && Array.isArray(raw.questions) ? { ...empty, ...raw } : empty;
    } catch { return empty; }
  });
  const [saveError, setSaveError] = useState('');
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(workspace)); setSaveError(''); }
    catch { setSaveError('Your browser could not save these changes. Try removing a large source.'); }
  }, [workspace]);
  return { workspace, setWorkspace, saveError };
}

export const uid = () => crypto.randomUUID();

export function starterQuestions(name: string, goal: string, audience: string): Question[] {
  return [
    audience ? `Tell me about your experience as ${audience}. What does a typical day look like?` : 'Tell me about the last time you ran into the problem this product is meant to solve.',
    `Walk me through the last time you used ${name === 'My product' ? 'the product' : name}. What were you trying to do?`,
    goal ? `We want to understand: “${goal}”. Can you share a specific experience that would help us understand that?` : 'Where did you get stuck, or find yourself doing something outside the product?',
    'If you could change one thing about that experience, what would it be and why?',
  ].map(text => ({ id: uid(), text, followUp: true }));
}
