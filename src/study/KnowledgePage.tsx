import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { FileText, Globe, Loader2, Pencil, Plug, Plus, Trash2, Upload, X } from 'lucide-react';
import {
  useQuery,
  getStudy,
  updateStudy,
  addSource,
  deleteSource,
  importWebsite,
  importMcp,
} from 'wasp/client/operations';
import type { Source } from 'wasp/entities';
import { Layout, PageHeader, ErrorNote } from '../Layout';

type SourceKind = 'url' | 'description' | 'pdf' | 'mcp';

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

// Scraped pages carry SEO titles like "Acme: Free AI thing for teams | Acme"; show just the name.
function cleanSourceTitle(title: string) {
  const parts = title
    .split(/\s+[|–—·•]\s+|\s+-\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return title;
  const last = parts[parts.length - 1];
  const name = parts.length > 1 && last.length <= 32 ? last : parts[0].split(/:\s/)[0];
  return name.length > 60 ? `${name.slice(0, 57).trimEnd()}…` : name;
}
function sourcePreview(content: string, max = 260) {
  const text = content
    .replace(/[#*_`>]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max).replace(/\s+\S*$/, '')}…` : text;
}

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
      if (!content.trim()) throw new Error('This PDF has no readable text. Please paste a description instead.');
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
      <PageHeader title="Knowledge" description="What Mira knows about the product before each interview." />
      <ErrorNote message={saveError} />
      <section className="product-card">
        <div className="product-details">
          <label htmlFor="product-name">Product</label>
          <input
            id="product-name"
            aria-label="Product name"
            value={name ?? study?.name ?? ''}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              // The server rejects an empty name; show the saved one again instead of a name that never saved.
              if (name !== null) updateStudy({ studyId, name }).catch(() => setName(null));
            }}
            placeholder="Give your product a name"
          />
        </div>
      </section>
      <div className="section-heading">
        <h2>Add a source</h2>
      </div>
      <div className="source-grid">
        {Object.entries(kinds).map(([id, item]) => (
          <button className="source-tile" key={id} onClick={() => open(id as SourceKind)}>
            <span className={`source-icon ${id}`}>
              <item.icon size={21} />
            </span>
            <h3>{item.name}</h3>
            <p>{item.description}</p>
            <span className="tile-link">{item.hint}</span>
          </button>
        ))}
      </div>
      <section className="sources-panel">
        <div className="panel-heading">
          <h2>Sources</h2>
          <span className="subtle"></span>
        </div>
        {sources.length === 0 ? (
          <div className="empty-sources">
            <h3>No sources yet</h3>
            <p>Add your site or a short description so Mira knows the product.</p>
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
                  <div className="source-name">
                    <strong title={source.title}>{cleanSourceTitle(source.title)}</strong>
                    <small>
                      {source.detail} ·{' '}
                      {new Date(source.createdAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </small>
                    {source.content && <p className="source-snippet">{sourcePreview(source.content)}</p>}
                    <button className="text-link source-more" onClick={() => setView(source)}>
                      Read full text
                    </button>
                  </div>
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
        <div>
          <h3>Interview questions</h3>
          <p>Review what Mira will ask.</p>
        </div>
        <Link className="text-link" to={`/study/${studyId}/questionnaire`}>
          Review questions
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
                <h2 id="modal-title">{cleanSourceTitle(view.title)}</h2>
                <p className="source-detail">{view.detail}</p>
                <div className="source-preview">{view.content.replace(/\n{3,}/g, '\n\n').trim()}</div>
              </>
            ) : (
              <>
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
                          placeholder={kind === 'mcp' ? 'https://your-server.com/mcp' : 'https://your-product.com'}
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
                      <button className="button secondary" type="button" disabled={busy} onClick={() => setKind(null)}>
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
