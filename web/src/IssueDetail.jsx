import { useState } from 'react';
import AdfRenderer, { FieldValue } from './AdfRenderer.jsx';
import './IssueDetail.css';

const STATUS_CATEGORY_CLASS = {
  new: 'issue-lozenge-new',
  indeterminate: 'issue-lozenge-indeterminate',
  done: 'issue-lozenge-done',
};

const AVATAR_COLORS = ['#2f9e44', '#1971c2', '#9c36b5', '#e8590c', '#0c8599', '#5c940d', '#c2255c', '#5f3dc4'];

function relativeTime(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 45) return 'just now';
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.round(diffHour / 24);
  if (diffDay <= 30) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString();
}

function formatBytes(n) {
  if (n == null || Number.isNaN(n)) return '';
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
}

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function hashColor(name) {
  const str = name || '';
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

function Avatar({ person }) {
  const name = person && person.displayName ? person.displayName : null;
  return (
    <span className="issue-avatar" style={{ background: hashColor(name || '?') }}>
      {initials(name)}
    </span>
  );
}

function StatusLozenge({ status, statusCategory }) {
  if (!status) return null;
  const cls = STATUS_CATEGORY_CLASS[statusCategory] || 'issue-lozenge-new';
  return <span className={`issue-lozenge ${cls}`}>{status}</span>;
}

function IssueRefRow({ item, onIssueKeyClick, showType = true }) {
  return (
    <div className="issue-ref-row">
      {showType && item.type && <span className="muted">{item.type}</span>}
      <button type="button" className="issue-link" onClick={() => onIssueKeyClick(item.key)}>
        {item.key}
      </button>
      <span className="issue-ref-summary">{item.summary}</span>
      <StatusLozenge status={item.status} statusCategory={item.statusCategory} />
      {item.priority && <span className="muted">{item.priority}</span>}
    </div>
  );
}

function Section({ title, count, children }) {
  return (
    <section className="issue-section">
      <h2 className="issue-section-title">
        {title}
        {count != null ? ` (${count})` : ''}
      </h2>
      {children}
    </section>
  );
}

function Chips({ items, kind }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="chips">
      {items.map((item) => (
        <span className="chip" data-kind={kind} key={item}>
          {item}
        </span>
      ))}
    </div>
  );
}

function DetailRow({ label, children }) {
  return (
    <div className="issue-detail-row">
      <span className="issue-detail-label muted">{label}</span>
      <span className="issue-detail-value">{children}</span>
    </div>
  );
}

function CommentItem({ comment, onIssueKeyClick }) {
  const edited = comment.updated && comment.updated !== comment.created;
  const name = comment.author && comment.author.displayName ? comment.author.displayName : 'Unknown';
  return (
    <div className="issue-comment">
      <Avatar person={comment.author} />
      <div className="issue-comment-body">
        <div className="issue-comment-header">
          <span className="issue-comment-author">{name}</span>
          <span className="muted" title={comment.created}>
            {relativeTime(comment.created)}
            {edited ? ' (edited)' : ''}
          </span>
        </div>
        <AdfRenderer doc={comment.bodyAdf} attachments={[]} onIssueKeyClick={onIssueKeyClick} />
      </div>
    </div>
  );
}

function SkeletonBlock({ lines = 3 }) {
  return (
    <div className="issue-skeleton">
      {Array.from({ length: lines }, (_, i) => `skeleton-${i}`).map((id) => (
        <div className="issue-skeleton-line" key={id} />
      ))}
    </div>
  );
}

function FallbackHeader({ fallback, detail }) {
  const data = detail || fallback;
  if (!data) return null;
  return (
    <>
      <h1 className="issue-title">{data.summary}</h1>
      <div className="chips">
        {data.type && (
          <span className="chip" data-kind="type">
            {data.type}
          </span>
        )}
        {data.status && (
          <span className="chip" data-kind="status">
            {data.status}
          </span>
        )}
        {data.priority && (
          <span className="chip" data-kind="priority">
            {data.priority}
          </span>
        )}
        {data.assignee && (
          <span className="chip">{data.assignee.displayName || data.assignee}</span>
        )}
      </div>
    </>
  );
}

export default function IssueDetail({ detail, fallback, loading, error, onRefresh, onIssueKeyClick }) {
  const [commentsExpanded, setCommentsExpanded] = useState(false);

  if (!detail && !fallback && !loading && !error) {
    return <div className="empty">Select an issue</div>;
  }

  if (!detail) {
    const data = fallback;
    return (
      <article className="issue">
        <header className="issue-header">
          <div className="issue-breadcrumb muted">
            {data ? data.key : ''}
          </div>
          {data ? <FallbackHeader fallback={data} /> : null}
          {error && (
            <div className="issue-error">
              <span>{error}</span>
              <button type="button" className="btn btn-ghost" onClick={onRefresh}>
                Retry
              </button>
            </div>
          )}
        </header>
        {loading && (
          <div className="issue-body">
            <div className="issue-main">
              <SkeletonBlock lines={4} />
            </div>
            <aside className="issue-details">
              <SkeletonBlock lines={6} />
            </aside>
          </div>
        )}
      </article>
    );
  }

  const comments = detail.comments || [];
  const visibleComments = commentsExpanded || comments.length <= 5 ? comments : comments.slice(-5);
  const linkGroups = {};
  (detail.links || []).forEach((link) => {
    if (!linkGroups[link.label]) linkGroups[link.label] = [];
    linkGroups[link.label].push(link);
  });

  return (
    <article className="issue">
      <header className="issue-header">
        <div className="issue-header-top">
          <div className="issue-breadcrumb muted">
            {detail.parent && (
              <>
                {detail.parent.type && <span>{detail.parent.type} </span>}
                <button type="button" className="issue-link" onClick={() => onIssueKeyClick(detail.parent.key)}>
                  {detail.parent.key}
                </button>
                <span> / </span>
              </>
            )}
            <a href={detail.url} target="_blank" rel="noreferrer" className="issue-link">
              {detail.key}
            </a>
          </div>
          <div className="issue-header-actions">
            {detail.stale && (
              <span className="issue-stale-badge" title="Showing cached copy — Jira unavailable">
                Showing cached copy — Jira unavailable
              </span>
            )}
            <span className="muted">Updated from Jira {relativeTime(detail.fetchedAt)}</span>
            <button type="button" className="btn btn-ghost" onClick={onRefresh}>
              ↻ Refresh
            </button>
          </div>
        </div>
        <h1 className="issue-title">{detail.summary}</h1>
      </header>

      <div className="issue-body">
        <div className="issue-main">
          <Section title="Description">
            {detail.descriptionAdf ? (
              <AdfRenderer doc={detail.descriptionAdf} attachments={detail.attachments || []} onIssueKeyClick={onIssueKeyClick} />
            ) : (
              <div className="muted">No description</div>
            )}
          </Section>

          {detail.environmentAdf && (
            <Section title="Environment">
              <AdfRenderer doc={detail.environmentAdf} attachments={detail.attachments || []} onIssueKeyClick={onIssueKeyClick} />
            </Section>
          )}

          {detail.attachments && detail.attachments.length > 0 && (
            <Section title="Attachments" count={detail.attachments.length}>
              <div className="issue-attachments">
                {detail.attachments.map((att) => (
                  <a key={att.id} href={att.contentUrl} target="_blank" rel="noreferrer" className="issue-attachment-tile">
                    {att.thumbnailUrl ? (
                      <img src={att.thumbnailUrl} alt={att.filename} loading="lazy" className="issue-attachment-thumb" />
                    ) : (
                      <div className="issue-attachment-icon">📄</div>
                    )}
                    <div className="issue-attachment-filename" title={att.filename}>
                      {att.filename}
                    </div>
                    <div className="muted issue-attachment-meta">
                      {formatBytes(att.size)}
                      {att.author && att.author.displayName ? ` · ${att.author.displayName}` : ''}
                    </div>
                  </a>
                ))}
              </div>
            </Section>
          )}

          {detail.subtasks && detail.subtasks.length > 0 && (
            <Section title="Subtasks" count={detail.subtasks.length}>
              {detail.subtasks.map((item) => (
                <IssueRefRow key={item.key} item={item} onIssueKeyClick={onIssueKeyClick} />
              ))}
            </Section>
          )}

          {detail.links && detail.links.length > 0 && (
            <Section title="Linked issues" count={detail.links.length}>
              {Object.entries(linkGroups).map(([label, items]) => (
                <div key={label} className="issue-link-group">
                  <div className="issue-link-group-label muted">{label}</div>
                  {items.map((link) => (
                    <IssueRefRow key={link.id} item={link.issue} onIssueKeyClick={onIssueKeyClick} />
                  ))}
                </div>
              ))}
            </Section>
          )}

          <Section title="Comments" count={detail.commentTotal}>
            {comments.length === 0 ? (
              <div className="muted">No comments</div>
            ) : (
              <>
                {!commentsExpanded && comments.length > 5 && (
                  <button type="button" className="btn btn-ghost" onClick={() => setCommentsExpanded(true)}>
                    Show all {comments.length} comments
                  </button>
                )}
                {visibleComments.map((comment) => (
                  <CommentItem key={comment.id} comment={comment} onIssueKeyClick={onIssueKeyClick} />
                ))}
              </>
            )}
          </Section>
        </div>

        <aside className="issue-details">
          <StatusLozenge status={detail.status} statusCategory={detail.statusCategory} />
          <div className="issue-detail-list">
            <DetailRow label="Assignee">
              {detail.assignee ? (
                <span className="issue-person">
                  <Avatar person={detail.assignee} /> {detail.assignee.displayName}
                </span>
              ) : (
                'Unassigned'
              )}
            </DetailRow>
            {detail.reporter && (
              <DetailRow label="Reporter">
                <span className="issue-person">
                  <Avatar person={detail.reporter} /> {detail.reporter.displayName}
                </span>
              </DetailRow>
            )}
            {detail.priority && <DetailRow label="Priority">{detail.priority}</DetailRow>}
            {detail.type && <DetailRow label="Type">{detail.type}</DetailRow>}
            {detail.resolution && <DetailRow label="Resolution">{detail.resolution}</DetailRow>}
            {detail.labels && detail.labels.length > 0 && (
              <DetailRow label="Labels">
                <Chips items={detail.labels} kind="label" />
              </DetailRow>
            )}
            {detail.components && detail.components.length > 0 && (
              <DetailRow label="Components">
                <Chips items={detail.components} kind="component" />
              </DetailRow>
            )}
            {detail.fixVersions && detail.fixVersions.length > 0 && (
              <DetailRow label="Fix versions">{detail.fixVersions.join(', ')}</DetailRow>
            )}
            {detail.affectsVersions && detail.affectsVersions.length > 0 && (
              <DetailRow label="Affects versions">{detail.affectsVersions.join(', ')}</DetailRow>
            )}
            {detail.dueDate && <DetailRow label="Due date">{new Date(detail.dueDate).toLocaleDateString()}</DetailRow>}
            {detail.timeTracking && (
              <DetailRow label="Time tracking">
                {[
                  detail.timeTracking.originalEstimate && `Original: ${detail.timeTracking.originalEstimate}`,
                  detail.timeTracking.remainingEstimate && `Remaining: ${detail.timeTracking.remainingEstimate}`,
                  detail.timeTracking.timeSpent && `Spent: ${detail.timeTracking.timeSpent}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </DetailRow>
            )}
            {detail.created && (
              <DetailRow label="Created">
                <span title={detail.created}>{relativeTime(detail.created)}</span>
              </DetailRow>
            )}
            {detail.updated && (
              <DetailRow label="Updated">
                <span title={detail.updated}>{relativeTime(detail.updated)}</span>
              </DetailRow>
            )}
            {detail.resolved && (
              <DetailRow label="Resolved">
                <span title={detail.resolved}>{relativeTime(detail.resolved)}</span>
              </DetailRow>
            )}
          </div>

          {detail.customFields && detail.customFields.length > 0 && (
            <details open className="issue-more-fields">
              <summary>More fields</summary>
              <div className="issue-detail-list">
                {detail.customFields.map((field) => (
                  <DetailRow label={field.name} key={field.id}>
                    <FieldValue value={field.value} attachments={detail.attachments || []} onIssueKeyClick={onIssueKeyClick} />
                  </DetailRow>
                ))}
              </div>
            </details>
          )}
        </aside>
      </div>
    </article>
  );
}
