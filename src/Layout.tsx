import type { ReactNode } from 'react';
import { NavLink, Link } from 'react-router';
import { AlertCircle, AudioLines, BarChart3, BookOpen, ChevronDown, ListChecks } from 'lucide-react';
import './Main.css';

export type Page = 'knowledge' | 'questionnaire' | 'report';
const titles = { knowledge: 'Knowledge base', questionnaire: 'Questionnaire', report: 'Report' };

function Mark({ small = false }: { small?: boolean }) { return <span className={`brand-mark ${small ? 'small' : ''}`}><AudioLines size={small ? 17 : 23}/></span>; }
export function Layout({ page, children, sourceCount, questionCount }: { page: Page; children: ReactNode; sourceCount: number; questionCount: number }) {
  return <div className="app"><aside className="sidebar"><Link className="brand" to="/"><Mark/><span>fieldwork<span className="brand-dot">.</span></span></Link>
    <div className="workspace-switch"><span className="workspace-icon">M</span><span>My workspace<small>Personal workspace</small></span><ChevronDown size={14}/></div>
    <div className="nav-label">WORKSPACE</div><nav>{([{ id: 'knowledge', path: '/', icon: BookOpen, label: 'Knowledge base', count: sourceCount }, { id: 'questionnaire', path: '/questionnaire', icon: ListChecks, label: 'Questionnaire', count: questionCount }, { id: 'report', path: '/report', icon: BarChart3, label: 'Report', count: 0 }] as const).map(item => <NavLink end={item.path === '/'} key={item.id} to={item.path} className={`nav-item ${page === item.id ? 'selected' : ''}`}><item.icon size={18}/><span>{item.label}</span>{item.count > 0 && <span className="nav-count">{item.count}</span>}</NavLink>)}</nav>
    <div className="sidebar-bottom"><div className="little-note"><span className="live-dot"/>Good research starts<br/>with a little listening.</div><div className="profile"><span className="avatar">Y</span><div>Your workspace<small>Built with Wasp <span>↗</span></small></div><span className="profile-dot"/></div></div></aside>
    <div className="main-shell"><header className="topbar"><span>Workspace</span><span className="slash">/</span><span className="breadcrumb">{titles[page]}</span><div className="topbar-right"><span className="draft-dot"/> Study draft <span className="top-avatar">Y</span></div></header><main>{children}</main><footer><span>Less guessing. More listening.</span><span>Made for the conversations that matter.</span></footer></div>
  </div>;
}
export function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) { return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action}</div>; }
export function ErrorNote({ message }: { message: string }) { return message ? <div role="alert" className="error"><AlertCircle size={16}/>{message}</div> : null; }
