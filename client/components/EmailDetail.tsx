import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  FileText,
  GitBranch,
  Info,
  LoaderCircle,
  Paperclip,
  RotateCcw,
  ShieldCheck,
  ShieldAlert,
  Quote,
  AlertTriangle,
} from 'lucide-react';
import type { EmailRecord, Evidence } from '../../shared/contracts';
import { StatusBadge } from './StatusBadge';
import { api } from '../api';

function EvidenceQuote({ evidence }: { evidence: Evidence }) {
  return (
    <blockquote className="evidence">
      <Quote size={13} aria-hidden="true" />
      <div>
        <p>{evidence.quote}</p>
        <cite>
          {evidence.source === 'body'
            ? 'Email body'
            : evidence.source === 'headers'
              ? 'Email headers'
              : evidence.source}
        </cite>
      </div>
    </blockquote>
  );
}
export function EmailDetail({
  email,
  onBack,
  onRefresh,
}: {
  email: EmailRecord;
  onBack: () => void;
  onRefresh: () => void;
}) {
  const [tab, setTab] = useState<'review' | 'source' | 'entities'>('review');
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setTab('review');
    setError('');
    if (window.matchMedia('(max-width: 760px)').matches)
      document.getElementById('selected-message-title')?.focus({ preventScroll: true });
  }, [email.id]);
  const a = email.assessment,
    extraction = email.extraction;
  const busy = ['queued', 'extracting', 'assessing'].includes(email.status);
  const from = extraction?.sender ?? email.input.sender ?? 'Unknown sender';
  const date = extraction?.date ?? email.input.date;
  async function retry() {
    setRetrying(true);
    setError('');
    try {
      await api(`/emails/${email.id}/retry`, { method: 'POST' });
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not retry.');
    } finally {
      setRetrying(false);
    }
  }
  return (
    <article className="detail-panel" aria-label="Selected email">
      <header className="detail-header">
        <div className="detail-overline">
          <button className="back-button" onClick={onBack}>
            <ArrowLeft size={16} />
            Inbox
          </button>
          <span className="eyebrow">MESSAGE REVIEW</span>
          <span className="message-id">
            {email.id.startsWith('E0') ? email.id : email.id.slice(0, 8)}
          </span>
        </div>
        <h2 id="selected-message-title" tabIndex={-1}>
          {extraction?.subject ?? email.input.subject ?? 'Untitled message'}
        </h2>
        <div className="sender-line">
          <span className="avatar">{from.slice(0, 2).toUpperCase()}</span>
          <div>
            <strong>{from}</strong>
            <span>
              To{' '}
              {(extraction?.recipients ?? email.input.recipients).join(', ') || 'Unknown recipient'}
            </span>
          </div>
        </div>
        <div className="detail-meta">
          <time>
            {date && !Number.isNaN(Date.parse(date))
              ? new Date(date).toLocaleString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZone: 'UTC',
                }) + ' UTC'
              : date || 'Date not provided'}
          </time>
          <StatusBadge risk={a?.level ?? null} status={email.status} />
        </div>
      </header>
      <div className="detail-tabs" aria-label="Email sections">
        {(['review', 'source', 'entities'] as const).map((value) => (
          <button key={value} aria-pressed={tab === value} onClick={() => setTab(value)}>
            {value === 'review'
              ? 'Overview'
              : value === 'source'
                ? 'Original content'
                : 'Entities & links'}
            {value === 'entities' && a && <span>{a.entities.length}</span>}
          </button>
        ))}
      </div>
      <div className="detail-body">
        {email.input.warnings.length > 0 && (
          <div className="notice warning">
            <AlertTriangle size={18} />
            <div>
              <strong>Partial analysis</strong>
              <p>
                Some attachment content could not be read. This assessment covers only the available
                text.
              </p>
              <ul>
                {email.input.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
        {email.error && (
          <div className="notice error" role="alert">
            <ShieldAlert size={19} />
            <div>
              <strong>
                {email.error.stage === 'assessment'
                  ? 'Risk assessment could not finish'
                  : 'Extraction could not finish'}
              </strong>
              <p>{email.error.message}</p>
              {extraction && (
                <p>Your completed extraction is saved. Retry resumes the risk assessment.</p>
              )}
              <button className="secondary-button small" onClick={retry} disabled={retrying}>
                <RotateCcw size={14} />
                {retrying ? 'Starting…' : 'Retry failed stage'}
              </button>
            </div>
          </div>
        )}
        {busy && (
          <div className="processing-card" role="status">
            <div className="processing-title">
              <LoaderCircle className="spin" size={17} />
              <strong>
                {email.status === 'queued'
                  ? 'Waiting for analysis'
                  : email.status === 'extracting'
                    ? 'Reading the evidence'
                    : 'Assessing risk & connections'}
              </strong>
            </div>
            <div className="pipeline-steps">
              <span className={extraction ? 'done' : 'current'}>
                {extraction ? <Check size={13} /> : <span>1</span>}Extract
              </span>
              <div />
              <span className={email.status === 'assessing' ? 'current' : ''}>
                <span>2</span>Assess
              </span>
              <div />
              <span>
                <span>3</span>Review
              </span>
            </div>
            <p>
              {email.status === 'queued'
                ? 'Messages are processed one at a time. If automatic processing is off, start this item below.'
                : 'Two local agents work in sequence. You can keep browsing.'}
            </p>
            {email.status === 'queued' && (
              <button className="text-button" disabled={retrying} onClick={retry}>
                Start analysis <ArrowRight size={13} />
              </button>
            )}
          </div>
        )}
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        {tab === 'review' && (
          <>
            {a && (
              <section className={`risk-card risk-card-${a.level}`}>
                <div className="section-heading">
                  <h3>
                    {a.level === 'none' ? <ShieldCheck size={18} /> : <ShieldAlert size={18} />}Risk
                    assessment
                  </h3>
                  <StatusBadge risk={a.level} status={email.status} />
                </div>
                <p className="rationale">{a.rationale}</p>
                <div className="tags">
                  {a.tags.map((tag) => (
                    <span key={tag}>{tag.replaceAll('-', ' ')}</span>
                  ))}
                </div>
                <div className="risk-footnote">
                  <Info size={13} />A review priority, not a determination of wrongdoing.
                </div>
              </section>
            )}
            {extraction && (
              <section className="review-section">
                <div className="section-heading">
                  <h3>
                    <FileText size={17} />
                    At a glance
                  </h3>
                  <span className="tiny-label">AGENT A</span>
                </div>
                <p className="summary-text">{extraction.summary}</p>
              </section>
            )}
            {a && (
              <section className="review-section">
                <div className="section-heading">
                  <h3>
                    <Quote size={17} />
                    Supporting evidence
                  </h3>
                  <span className="count-label">{a.evidence.length} sources cited</span>
                </div>
                {a.evidence.map((e, i) => (
                  <EvidenceQuote evidence={e} key={i} />
                ))}
              </section>
            )}
            {extraction && (
              <section className="review-section">
                <div className="section-heading">
                  <h3>Extracted facts</h3>
                  <span className="count-label">{extraction.facts.length} facts</span>
                </div>
                <div className="facts">
                  {extraction.facts.map((fact, i) => (
                    <details key={i} className="fact">
                      <summary>
                        <span className="fact-kind">{fact.kind}</span>
                        <span>{fact.value}</span>
                        <ChevronDown size={14} />
                      </summary>
                      <div className="fact-detail">
                        {fact.attribution && (
                          <p className="muted">Attributed to: {fact.attribution}</p>
                        )}
                        <EvidenceQuote evidence={fact.evidence} />
                      </div>
                    </details>
                  ))}
                </div>
              </section>
            )}
            {!extraction && !busy && (
              <div className="empty-inline">
                <FileText size={26} />
                <h3>No extraction yet</h3>
                <p>The original message is preserved in Original content.</p>
              </div>
            )}
            {!extraction && busy && (
              <section className="review-section">
                <h3>Original message preview</h3>
                <p className="source-text preview-text">{email.input.body}</p>
              </section>
            )}
            {extraction && (
              <details className="json-details">
                <summary>
                  View structured extraction <ChevronDown size={14} />
                </summary>
                <pre>{JSON.stringify(extraction, null, 2)}</pre>
              </details>
            )}
          </>
        )}
        {tab === 'source' && (
          <>
            <section className="review-section source-section">
              <div className="section-heading">
                <h3>
                  <FileText size={17} />
                  Original message
                </h3>
                <span className="tiny-label">{email.input.source}</span>
              </div>
              <p className="source-text">
                {email.input.body || 'No body text. See the attachments below.'}
              </p>
            </section>
            {email.input.attachments.map((attachment) => (
              <section className="attachment-card" key={attachment.filename}>
                <h3>
                  <Paperclip size={16} />
                  {attachment.filename}
                </h3>
                {attachment.warning ? (
                  <p className="error-text">{attachment.warning}</p>
                ) : (
                  <p className="source-text">{attachment.text}</p>
                )}
              </section>
            ))}
          </>
        )}
        {tab === 'entities' && (
          <>
            {a ? (
              <>
                <div className="section-heading">
                  <h3>People, places & values</h3>
                  <span className="count-label">{a.entities.length} entities</span>
                </div>
                <div className="entity-grid">
                  {a.entities.map((entity) => (
                    <details className="entity-card" key={entity.id}>
                      <summary>
                        <span className={`entity-type type-${entity.type}`}>{entity.type}</span>
                        <strong>{entity.name}</strong>
                        <span className="entity-evidence-hint">
                          View evidence <ChevronDown size={12} />
                        </span>
                      </summary>
                      <EvidenceQuote evidence={entity.evidence} />
                    </details>
                  ))}
                </div>
                <section className="review-section">
                  <div className="section-heading">
                    <h3>
                      <GitBranch size={17} />
                      Relationships
                    </h3>
                  </div>
                  {a.relationships.length ? (
                    a.relationships.map((rel, i) => (
                      <details className="relationship" key={i}>
                        <summary>
                          <strong>{a.entities.find((e) => e.id === rel.sourceId)?.name}</strong>
                          <span>
                            <ArrowRight size={14} />
                            {rel.type.replaceAll('_', ' ')}
                          </span>
                          <strong>{a.entities.find((e) => e.id === rel.targetId)?.name}</strong>
                        </summary>
                        <EvidenceQuote evidence={rel.evidence} />
                      </details>
                    ))
                  ) : (
                    <p className="muted">No supported relationships were identified.</p>
                  )}
                </section>
              </>
            ) : (
              <div className="empty-inline">
                <GitBranch size={28} />
                <h3>Connections will appear here</h3>
                <p>Entities and relationships become available after risk assessment.</p>
              </div>
            )}
          </>
        )}
        {extraction && (
          <footer className="analysis-footer">
            <span>
              <Check size={12} />
              Evidence quotes validated
            </span>
            <span>
              Extraction: {email.model} · prompt v{email.promptVersion}
            </span>
          </footer>
        )}
      </div>
    </article>
  );
}
