import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  FileText,
  Globe,
  ListChecks,
  Loader2,
  Pencil,
  Plug,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  useQuery,
  getStudy,
  updateStudy,
  addSource,
  deleteSource,
  importWebsite,
  importMcp,
} from 'wasp/client/operations';
import type { SourceKind } from '../store';
import type { Source } from 'wasp/entities';
import { Layout, PageHeader, ErrorNote } from '../Layout';

const kinds = {
  url: { icon: Globe, name: 'Website', description: 'Start with your product URL', hint: 'Add a URL' },
  description: {
    icon: Pencil,
    name: 'Description',
    description: 'Tell us in your own words',
    hint: 'Write a description',
  },
  pdf: {
    icon: FileText,
    name: 'Document',
    description: 'Upload a product brief or PDF',
    hint: 'Upload a PDF',
  },
  mcp: {
    icon: Plug,
    name: 'MCP connection',
    description: 'Bring context from your tools',
    hint: 'Connect a source',
  },
};

export function KnowledgePage() {
  const { studyId = '' } = useParams();
  const { data: study } = useQuery(getStudy, { studyId });
  const sources = study?.sources ?? [];
  const [name, setName] = useState<string | null>(null);
  const saveError = '';
  const [kind, setKind] = useState<SourceKind | null>(null);
  const [view, setView] = useState<Source | null>(null);
  const [title, setTitle] = useState('');
  const [value, setValue] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  function open(next: SourceKind) {
    setKind(next);
    setTitle('');
    setValue('');
    setToken('');
    setError('');
  }
  async function add(source: { title: string; content: string; detail: string }, sourceKind: SourceKind) {
    await addSource({ studyId, kind: sourceKind, ...source });
    setKind(null);
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!kind || !value.trim()) return;
    setBusy(true);
    setError('');
    try {
      if (kind === 'description')
        await add(
          {
            title: title.trim() || 'Product description',
            content: value.trim(),
            detail: `${value.trim().split(/\s+/).length} words`,
          },
          kind,
        );
      else if (kind === 'url')
        await add(
          await importWebsite({
            url: value.trim().startsWith('http') ? value.trim() : `https://${value.trim()}`,
          }),
          kind,
        );
      else if (kind === 'mcp')
        await add(await importMcp({ endpoint: value.trim(), token: token.trim() || undefined }), kind);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to import this source.');
    } finally {
      setBusy(false);
    }
  }
  async function upload(file?: File) {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('Please use a PDF smaller than 10 MB.');
      const pdf = await import('pdfjs-dist');
      const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
      pdf.GlobalWorkerOptions.workerSrc = worker.default;
      const doc = await pdf.getDocument({ data: await file.arrayBuffer() }).promise;
      let content = '';
      for (let i = 1; i <= Math.min(doc.numPages, 60); i++) {
        const page = await doc.getPage(i);
        const text = await page.getTextContent();
        content += text.items.map((item) => ('str' in item ? item.str : '')).join(' ') + '\n';
      }
      if (!content.trim())
        throw new Error('This PDF has no readable text. Please paste a description instead.');
      await add(
        {
          title: file.name,
          content: content.slice(0, 100000),
          detail: `${Math.min(doc.numPages, 60)} pages imported`,
        },
        'pdf',
      );
      await doc.destroy();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to read this PDF.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Layout page="knowledge" sourceCount={sources.length} questionCount={study?.questions.length ?? 0}>
      <PageHeader
        title="A little context goes a long way."
        description="Give your interviewer a home base for understanding your product."
      />
      <ErrorNote message={saveError} />
      <section className="product-card">
        <div className="product-icon">
          <BookOpen size={21} />
        </div>
        <div className="product-details">
          <label htmlFor="product-name">YOUR PRODUCT</label>
          <input
            id="product-name"
            aria-label="Product name"
            value={name ?? study?.name ?? ''}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              if (name !== null) updateStudy({ studyId, name });
            }}
            placeholder="Give your product a name"
          />
        </div>
        <span className="quiet-pill">
          <span className="live-dot" />
          Getting to know you
        </span>
      </section>
      <div className="section-heading">
        <h2>Add your product knowledge</h2>
        <span>Start with one. Add more anytime.</span>
      </div>
      <div className="source-grid">
        {Object.entries(kinds).map(([id, item]) => (
          <button className="source-tile" key={id} onClick={() => open(id as SourceKind)}>
            <span className={`source-icon ${id}`}>
              <item.icon size={21} />
            </span>
            <h3>{item.name}</h3>
            <p>{item.description}</p>
            <span className="tile-link">
              {item.hint}
              <Plus size={15} />
            </span>
          </button>
        ))}
      </div>
      <section className="sources-panel">
        <div className="panel-heading">
          <h2>
            Your sources <span className="number-tag">{sources.length}</span>
          </h2>
          <span className="subtle">Only the context you choose to add</span>
        </div>
        {sources.length === 0 ? (
          <div className="empty-sources">
            <div className="document-stack">
              <FileText size={25} />
              <span>
                <Plus size={12} />
              </span>
            </div>
            <h3>A blank page. A good place to start.</h3>
            <p>
              Add a source above to help your interviewer understand
              <br className="desktop-break" /> what you’re building and who it’s for.
            </p>
          </div>
        ) : (
          <div className="source-list">
            {sources.map((source) => {
              const Icon = kinds[source.kind as SourceKind].icon;
              return (
                <div className="source-row" key={source.id}>
                  <span className={`source-icon ${source.kind}`}>
                    <Icon size={19} />
                  </span>
                  <button className="source-name" onClick={() => setView(source)}>
                    <strong>{source.title}</strong>
                    <small>
                      {source.detail} ·{' '}
                      {new Date(source.createdAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </small>
                  </button>
                  <span className="ready">
                    <CheckCircle2 size={13} />
                    Ready
                  </span>
                  <button
                    className="icon-button delete"
                    aria-label={`Remove ${source.title}`}
                    onClick={() => deleteSource({ sourceId: source.id })}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
      <div className="next-step">
        <div className="next-icon">
          <ListChecks size={22} />
        </div>
        <div>
          <h3>Context, meet curiosity.</h3>
          <p>Next, decide what you’d like to learn from your users.</p>
        </div>
        <Link className="text-link" to={`/study/${studyId}/questionnaire`}>
          Set up your questions
          <ArrowRight size={16} />
        </Link>
      </div>
      {(kind || view) && (
        <div
          className="modal-backdrop"
          onClick={() => {
            if (!busy) {
              setKind(null);
              setView(null);
            }
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              disabled={busy}
              aria-label="Close dialog"
              onClick={() => {
                setKind(null);
                setView(null);
              }}
            >
              <X size={20} />
            </button>
            {view ? (
              <>
                <div className="eyebrow">SOURCE CONTENT</div>
                <h2 id="modal-title">{view.title}</h2>
                <div className="source-preview">{view.content}</div>
              </>
            ) : (
              <>
                <div className="eyebrow">PRODUCT KNOWLEDGE</div>
                <h2 id="modal-title">
                  {kind === 'pdf'
                    ? 'Bring your documents.'
                    : kind === 'mcp'
                      ? 'Connect your context.'
                      : kind === 'url'
                        ? 'Start with your website.'
                        : 'Tell us about your product.'}
                </h2>
                <p className="modal-description">
                  {kind === 'mcp'
                    ? 'Import text resources from a remote MCP server. Your access token is used once and is not saved.'
                    : kind === 'pdf'
                      ? 'We’ll extract the text so it’s ready for your research.'
                      : 'A little detail helps you ask better questions.'}
                </p>
                <ErrorNote message={error} />
                {kind === 'pdf' ? (
                  <>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="application/pdf,.pdf"
                      hidden
                      onChange={(e) => upload(e.target.files?.[0])}
                    />
                    <button disabled={busy} className="upload-zone" onClick={() => fileRef.current?.click()}>
                      {busy ? <Loader2 className="spin" /> : <Upload />}
                      <strong>{busy ? 'Reading your document…' : 'Choose a PDF'}</strong>
                      <span>Text-based PDFs, up to 10 MB · first 60 pages</span>
                    </button>
                  </>
                ) : (
                  <form onSubmit={submit}>
                    {kind === 'description' && (
                      <label className="field">
                        Source name
                        <input
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          placeholder="e.g. Product overview"
                        />
                      </label>
                    )}
                    <label className="field">
                      {kind === 'url' ? 'Product URL' : kind === 'mcp' ? 'MCP endpoint' : 'Description'}
                      {kind === 'description' ? (
                        <textarea
                          required
                          autoFocus
                          rows={7}
                          maxLength={80000}
                          value={value}
                          onChange={(e) => setValue(e.target.value)}
                          placeholder="What does your product do? Who is it for? What problem does it solve?"
                        />
                      ) : (
                        <input
                          required
                          autoFocus
                          value={value}
                          onChange={(e) => setValue(e.target.value)}
                          placeholder={
                            kind === 'mcp' ? 'https://your-server.com/mcp' : 'https://your-product.com'
                          }
                        />
                      )}
                    </label>
                    {kind === 'mcp' && (
                      <label className="field">
                        Access token <span>(optional)</span>
                        <input
                          type="password"
                          autoComplete="off"
                          value={token}
                          onChange={(e) => setToken(e.target.value)}
                          placeholder="Bearer token"
                        />
                      </label>
                    )}
                    <div className="modal-actions">
                      <button
                        className="button secondary"
                        type="button"
                        disabled={busy}
                        onClick={() => setKind(null)}
                      >
                        Cancel
                      </button>
                      <button className="button primary" disabled={busy || !value.trim()}>
                        {busy ? (
                          <>
                            <Loader2 size={16} className="spin" />
                            Importing…
                          </>
                        ) : (
                          <>
                            <Plus size={16} />
                            Add source
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </Layout>
  );
}
