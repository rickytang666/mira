import type { ReactNode } from 'react';
import { NavLink, Link, useParams } from 'react-router';
import { AlertCircle, BarChart3, BookOpen, ListChecks, Plus } from 'lucide-react';
import './Main.css';

export type Page = 'studies' | 'knowledge' | 'questionnaire' | 'report';
function Mark() {
  return <img className="brand-mark" src="/mira-logo.png" alt="" width={36} height={36} />;
}
export function Layout({
  page,
  children,
  sourceCount,
  questionCount,
}: {
  page: Page;
  children: ReactNode;
  sourceCount: number;
  questionCount: number;
}) {
  const { studyId } = useParams();
  return (
    <div className="app">
      <aside className="sidebar">
        <Link className="brand" to="/" aria-label="Mira home">
          <Mark />
          <span className="brand-name">Mira<small>User researcher</small></span>
        </Link>
        <nav aria-label="Demo sections">
          {[
            { id: 'studies', path: '/', icon: Plus, label: 'New study', count: 0 },
            ...(studyId
              ? [
                  {
                    id: 'knowledge',
                    path: `/study/${studyId}/knowledge`,
                    icon: BookOpen,
                    label: 'Knowledge base',
                    count: sourceCount,
                  },
                  {
                    id: 'questionnaire',
                    path: `/study/${studyId}/questionnaire`,
                    icon: ListChecks,
                    label: 'Questionnaire',
                    count: questionCount,
                  },
                  {
                    id: 'report',
                    path: `/study/${studyId}/report`,
                    icon: BarChart3,
                    label: 'Report',
                    count: 0,
                  },
                ]
              : []),
          ].map((item) => (
            <NavLink
              end={item.path === '/'}
              key={item.id}
              to={item.path}
              className={`nav-item ${page === item.id ? 'selected' : ''}`}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
              {item.count > 0 && <span className="nav-count">{item.count}</span>}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="main-shell">
        <main>{children}</main>
      </div>
    </div>
  );
}
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
export function ErrorNote({ message }: { message: string }) {
  return message ? (
    <div role="alert" className="error">
      <AlertCircle size={16} />
      {message}
    </div>
  ) : null;
}
