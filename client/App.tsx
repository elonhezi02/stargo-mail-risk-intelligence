import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  ArrowDownWideNarrow,
  ArrowUpRight,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  Inbox,
  Layers3,
  LoaderCircle,
  Mail,
  Network,
  Paperclip,
  Plus,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import type { EmailRecord, EmailSummary, Health } from '../shared/contracts';
import { api } from './api';
import { AddEmailDialog } from './components/AddEmailDialog';
import { EmailDetail } from './components/EmailDetail';
import { StatusBadge } from './components/StatusBadge';
import { RiskFilter } from './components/RiskFilter';
const KnowledgeGraph = lazy(() => import('./components/KnowledgeGraph'));

type Filter = 'all' | 'high' | 'medium' | 'low' | 'none' | 'pending' | 'failed';
export default function App() {
  const [emails, setEmails] = useState<EmailSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<EmailRecord | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [view, setView] = useState<'inbox' | 'graph'>('inbox');
  const [adding, setAdding] = useState(false);
  const [mobileDetail, setMobileDetail] = useState(false);
  const [sortRisk, setSortRisk] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const data = await api<{ emails: EmailSummary[] }>('/emails');
        if (!alive) return;
        setEmails(data.emails);
        setError('');
        if (!selectedRef.current && data.emails.length) setSelected(data.emails[0].id);
      } catch (error) {
        if (alive) setError(error instanceof Error ? error.message : 'Could not load inbox.');
      } finally {
        if (alive) {
          setLoading(false);
          timer = setTimeout(poll, 2000);
        }
      }
    }
    void poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [refreshKey]);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const result = await api<Health>('/health');
        if (alive) setHealth(result);
      } catch {
        if (alive) setHealth(null);
      } finally {
        if (alive) timer = setTimeout(poll, 10000);
      }
    }
    void poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [refreshKey]);
  useEffect(() => {
    if (!selected) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    setDetail(null);
    setDetailError('');
    async function poll() {
      try {
        const result = await api<EmailRecord>(`/emails/${selected}`);
        if (alive) {
          setDetail(result);
          setDetailError('');
        }
      } catch (error) {
        if (alive)
          setDetailError(error instanceof Error ? error.message : 'Could not load message.');
      } finally {
        if (alive) timer = setTimeout(poll, 2000);
      }
    }
    void poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [selected, refreshKey]);
  function select(id: string) {
    setSelected(id);
    setMobileDetail(true);
    setView('inbox');
  }
  const high = emails.filter((e) => e.risk === 'high').length;
  const medium = emails.filter((e) => e.risk === 'medium').length;
  const reviewed = emails.filter((e) => e.status === 'completed').length;
  const pending = emails.filter((e) =>
    ['queued', 'extracting', 'assessing'].includes(e.status),
  ).length;
  const failed = emails.filter((e) => e.status === 'failed').length;
  const counts: Record<Filter, number> = {
    all: emails.length,
    high,
    medium,
    low: emails.filter((e) => e.risk === 'low').length,
    none: emails.filter((e) => e.risk === 'none').length,
    pending,
    failed,
  };
  const filtered = emails
    .filter((e) => {
      const match =
        filter === 'all' ||
        (filter === 'pending'
          ? ['queued', 'extracting', 'assessing'].includes(e.status)
          : filter === 'failed'
            ? e.status === 'failed'
            : e.risk === filter);
      return (
        match &&
        [e.subject, e.sender, e.preview, ...e.tags]
          .join(' ')
          .toLowerCase()
          .includes(query.toLowerCase())
      );
    })
    .sort((a, b) =>
      sortRisk
        ? { high: 4, medium: 3, low: 2, none: 1 }[b.risk ?? 'none'] -
          { high: 4, medium: 3, low: 2, none: 1 }[a.risk ?? 'none']
        : 0,
    );
  function navigate(nextFilter: Filter) {
    setView('inbox');
    setFilter(nextFilter);
    setMobileDetail(false);
  }
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(event) => {
            event.preventDefault();
            navigate('all');
          }}
          aria-label="Arcline home"
        >
          <span className="brand-mark">
            A<span />
          </span>
          <span>
            arcline<span className="brand-period">.</span>
          </span>
        </a>
        <div className="workspace-label">
          <span className="workspace-icon">
            <Layers3 size={16} />
          </span>
          <div>
            Risk workspace<small>LOCAL ENVIRONMENT</small>
          </div>
          <ChevronRight size={14} />
        </div>
        <span className="nav-label">WORKSPACE</span>
        <nav aria-label="Main navigation">
          <button
            className={view === 'inbox' && filter === 'all' ? 'nav-item active' : 'nav-item'}
            onClick={() => navigate('all')}
          >
            <Inbox size={18} />
            <span>Inbox</span>
            <span className="nav-count">{emails.length}</span>
          </button>
          <button
            className={view === 'graph' ? 'nav-item active' : 'nav-item'}
            onClick={() => setView('graph')}
          >
            <Network size={18} />
            <span>Knowledge graph</span>
          </button>
        </nav>
        <span className="nav-label risk-nav-label">REVIEW QUEUES</span>
        <nav className="risk-nav" aria-label="Review queues">
          <button
            className={view === 'inbox' && filter === 'high' ? 'nav-item active' : 'nav-item'}
            onClick={() => navigate('high')}
          >
            <span className="nav-dot red" />
            <span>High priority</span>
            <span className="quiet-count">{high}</span>
          </button>
          <button
            className={view === 'inbox' && filter === 'medium' ? 'nav-item active' : 'nav-item'}
            onClick={() => navigate('medium')}
          >
            <span className="nav-dot amber" />
            <span>Needs review</span>
            <span className="quiet-count">{medium}</span>
          </button>
          <button
            className={view === 'inbox' && filter === 'pending' ? 'nav-item active' : 'nav-item'}
            onClick={() => navigate('pending')}
          >
            <span className="nav-dot gray" />
            <span>Awaiting analysis</span>
            <span className="quiet-count">{pending}</span>
          </button>
          {failed > 0 && (
            <button
              className={filter === 'failed' ? 'nav-item active' : 'nav-item'}
              onClick={() => navigate('failed')}
            >
              <ShieldAlert size={15} />
              <span>Failed analysis</span>
              <span className="quiet-count">{failed}</span>
            </button>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-card">
            <ShieldCheck size={19} />
            <strong>Your data stays here.</strong>
            <p>
              Local intelligence.
              <br />
              Evidence you can trace.
            </p>
            <span>
              <span className={`connection-dot ${health?.available ? 'online' : ''}`} />
              {health?.available ? 'Local model connected' : 'Local model offline'}
            </span>
          </div>
          <div className="workspace-user">
            <span className="user-avatar">AR</span>
            <div>
              Arcline Review<small>Compliance & risk</small>
            </div>
            <ShieldCheck size={15} />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{view === 'inbox' ? 'Inbox' : 'Knowledge graph'}</strong>
          </div>
          <span className="topbar-status">
            <span className={`connection-dot ${health?.available ? 'online' : ''}`} />
            {health?.available ? 'Local processing' : 'Model offline'}
          </span>
          <span className="topbar-divider" />
          <span className="topbar-avatar">AR</span>
        </header>
        <main id="main-content">
          <section className="page-heading">
            <div>
              <div className="eyebrow">MAIL RISK INTELLIGENCE</div>
              <h1>{view === 'inbox' ? 'Clarity in every message.' : 'See the connections.'}</h1>
              <p>
                {view === 'inbox'
                  ? 'Turn incoming mail into evidence, context, and a clear next step.'
                  : 'Explore people, organizations, and the evidence that connects them.'}
              </p>
            </div>
            <button className="primary-button" onClick={() => setAdding(true)}>
              <Plus size={17} />
              Add email
            </button>
          </section>
          <nav className="mobile-view-nav" aria-label="Mobile navigation">
            <button aria-pressed={view === 'inbox'} onClick={() => setView('inbox')}>
              <Inbox size={15} />
              Inbox
            </button>
            <button aria-pressed={view === 'graph'} onClick={() => setView('graph')}>
              <Network size={15} />
              Knowledge graph
            </button>
          </nav>
          {error && (
            <div className="notice error global-notice" role="alert">
              <ShieldAlert size={18} />
              <div>
                <strong>Inbox unavailable</strong>
                <p>{error}</p>
                <button className="text-button" onClick={refresh}>
                  Try again
                </button>
              </div>
            </div>
          )}
          {health && !health.available && (
            <div className="model-notice">
              <InfoIcon />
              <p>
                <strong>Local model is not ready.</strong> {health.message} Saved messages remain
                available.
              </p>
              <button onClick={refresh} className="text-button">
                Check again
              </button>
            </div>
          )}
          {view === 'inbox' ? (
            <>
              <section className="stats-grid" aria-label="Mailbox summary">
                <button className="stat-card" onClick={() => navigate('all')}>
                  <span className="stat-icon neutral">
                    <Mail size={19} />
                  </span>
                  <div>
                    <span>Total messages</span>
                    <strong>{emails.length.toString().padStart(2, '0')}</strong>
                  </div>
                  <span className="stat-caption">In your inbox</span>
                </button>
                <button className="stat-card" onClick={() => navigate('high')}>
                  <span className="stat-icon danger">
                    <ShieldAlert size={19} />
                  </span>
                  <div>
                    <span>High priority</span>
                    <strong>{high.toString().padStart(2, '0')}</strong>
                  </div>
                  <ArrowUpRight size={17} className="stat-arrow" />
                </button>
                <button className="stat-card" onClick={() => navigate('medium')}>
                  <span className="stat-icon caution">
                    <Activity size={19} />
                  </span>
                  <div>
                    <span>Needs review</span>
                    <strong>{medium.toString().padStart(2, '0')}</strong>
                  </div>
                  <span className="stat-caption">Medium risk</span>
                </button>
                <div className="stat-card">
                  <span className="stat-icon success">
                    <CheckCheck size={19} />
                  </span>
                  <div>
                    <span>Analyzed</span>
                    <strong>
                      {reviewed.toString().padStart(2, '0')}
                      <small> / {emails.length}</small>
                    </strong>
                  </div>
                  <div
                    className="mini-progress"
                    role="img"
                    aria-label={`${reviewed} of ${emails.length} analyzed`}
                  >
                    <span
                      style={{ width: `${emails.length ? (reviewed / emails.length) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              </section>
              <section
                className={`mail-workspace ${mobileDetail ? 'show-detail' : ''}`}
                aria-label="Mailbox"
              >
                <div className="inbox-panel">
                  <div className="inbox-heading">
                    <h2>
                      Inbox <span>{filtered.length}</span>
                    </h2>
                    <button
                      className={`icon-button ${sortRisk ? 'selected' : ''}`}
                      aria-label="Sort by risk"
                      aria-pressed={sortRisk}
                      onClick={() => setSortRisk(!sortRisk)}
                      title="Sort by risk"
                    >
                      <ArrowDownWideNarrow size={18} />
                    </button>
                  </div>
                  <div className="search-box">
                    <Search size={17} />
                    <input
                      aria-label="Search inbox"
                      placeholder="Search messages…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    {query && (
                      <button
                        className="icon-button"
                        aria-label="Clear search"
                        onClick={() => setQuery('')}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  <div className="filter-row">
                    <span className="filter-caption">
                      <SlidersHorizontal size={13} /> Filter
                    </span>
                    <RiskFilter value={filter} counts={counts} onChange={setFilter} />
                    <span>{sortRisk ? 'Risk first' : 'Newest first'}</span>
                  </div>
                  <div className="message-list" aria-label="Messages">
                    {loading ? (
                      <div className="empty-inline" role="status">
                        <LoaderCircle className="spin" />
                        <p>Loading inbox…</p>
                      </div>
                    ) : filtered.length ? (
                      filtered.map((email) => (
                        <button
                          key={email.id}
                          className={`message-row ${selected === email.id ? 'selected' : ''}`}
                          onClick={() => select(email.id)}
                          aria-current={selected === email.id ? 'true' : undefined}
                        >
                          <div className="message-top">
                            <span
                              className={`message-avatar ${email.risk === 'high' ? 'alert-avatar' : ''}`}
                            >
                              {(email.sender ?? '?').slice(0, 2).toUpperCase()}
                            </span>
                            <span className="message-sender">
                              {email.sender ?? 'Unknown sender'}
                            </span>
                            <time>
                              {email.date && !Number.isNaN(Date.parse(email.date))
                                ? new Date(email.date).toLocaleDateString('en-GB', {
                                    month: 'short',
                                    day: 'numeric',
                                    timeZone: 'UTC',
                                  })
                                : 'No date'}
                            </time>
                          </div>
                          <h3>{email.subject ?? 'Untitled message'}</h3>
                          <p>{email.preview}</p>
                          <div className="message-bottom">
                            <StatusBadge risk={email.risk} status={email.status} />
                            <span className="message-extras">
                              {email.partial && <span>Partial</span>}
                              {email.attachmentCount > 0 && (
                                <span>
                                  <Paperclip size={12} />
                                  {email.attachmentCount}
                                </span>
                              )}
                            </span>
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="empty-inline">
                        <Search size={27} />
                        <h3>No matching messages</h3>
                        <p>Try another search or choose a different filter.</p>
                        <button
                          className="text-button"
                          onClick={() => {
                            setFilter('all');
                            setQuery('');
                          }}
                        >
                          Clear filters
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="inbox-footer">
                    <span className="connection-dot online" />
                    {pending ? `${pending} awaiting or in analysis` : 'Inbox up to date'}
                    <span>{emails.length} messages</span>
                  </div>
                </div>
                <div className="detail-container">
                  {detailError ? (
                    <div className="empty-inline" role="alert">
                      <ShieldAlert />
                      <p>{detailError}</p>
                      <button className="text-button" onClick={refresh}>
                        Try again
                      </button>
                    </div>
                  ) : detail ? (
                    <EmailDetail
                      email={detail}
                      onBack={() => {
                        setMobileDetail(false);
                        requestAnimationFrame(() =>
                          document.querySelector<HTMLInputElement>('.search-box input')?.focus(),
                        );
                      }}
                      onRefresh={refresh}
                    />
                  ) : (
                    <div className="empty-inline">
                      {selected ? (
                        <>
                          <LoaderCircle className="spin" />
                          <p>Loading message…</p>
                        </>
                      ) : (
                        <>
                          <Inbox size={32} />
                          <h3>Your review starts here</h3>
                          <p>Add a message or select one from the inbox.</p>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </section>
            </>
          ) : (
            <Suspense
              fallback={
                <div className="empty-inline">
                  <LoaderCircle className="spin" />
                  <p>Loading graph…</p>
                </div>
              }
            >
              <KnowledgeGraph onSelectEmail={select} refreshKey={`${reviewed}-${refreshKey}`} />
            </Suspense>
          )}
          <footer className="page-footer">
            <span>
              <ShieldCheck size={13} />
              Designed for human review
            </span>
            <span>Extract. Connect. Understand.</span>
          </footer>
        </main>
      </div>
      {adding && (
        <AddEmailDialog
          onClose={() => setAdding(false)}
          onAdded={(id) => {
            setAdding(false);
            setFilter('all');
            setQuery('');
            select(id);
            refresh();
          }}
        />
      )}
    </div>
  );
}
function InfoIcon() {
  return <CircleHelp size={18} />;
}
