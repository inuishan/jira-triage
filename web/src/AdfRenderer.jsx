import './AdfRenderer.css';

const COLOR_RE = /^#[0-9a-f]{3,8}$/i;
const ISSUE_KEY_RE = /\/browse\/([A-Z][A-Z0-9_]+-\d+)/;

function safeUrl(href) {
  try {
    const url = new URL(href);
    if (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:') {
      return url;
    }
  } catch {
    // ignore malformed URL
  }
  return null;
}

function renderLink(mark, text, key, onIssueKeyClick) {
  const href = mark?.attrs?.href;
  if (!href) return text;
  const url = safeUrl(href);
  if (!url) return text;
  const match = url.pathname.match(ISSUE_KEY_RE);
  if (match && typeof text === 'string' && text === href) {
    const issueKey = match[1];
    return (
      <a
        key={key}
        href={href}
        onClick={(e) => {
          e.preventDefault();
          onIssueKeyClick?.(issueKey);
        }}
      >
        {issueKey}
      </a>
    );
  }
  return (
    <a key={key} href={href} target="_blank" rel="noreferrer noopener">
      {text}
    </a>
  );
}

function Children({ nodes, attachments, onIssueKeyClick }) {
  if (!Array.isArray(nodes)) return null;
  return nodes.map((node, i) => (
    <AdfNode key={i} node={node} index={i} attachments={attachments} onIssueKeyClick={onIssueKeyClick} />
  ));
}

function findAttachment(attachments, alt) {
  if (!alt || !Array.isArray(attachments)) return null;
  return attachments.find((a) => a.filename === alt) || null;
}

function AttachmentChip({ attachment, alt }) {
  if (attachment && attachment.thumbnailUrl) {
    return (
      <a href={attachment.contentUrl} target="_blank" rel="noreferrer">
        <img className="adf-media" src={attachment.thumbnailUrl} alt={attachment.filename} />
      </a>
    );
  }
  if (attachment) {
    return (
      <a className="adf-attachment-chip" href={attachment.contentUrl} target="_blank" rel="noreferrer">
        📎 {attachment.filename}
      </a>
    );
  }
  return <span className="adf-attachment-chip">📎 {alt || 'attachment'}</span>;
}

function AdfNode({ node, attachments, onIssueKeyClick }) {
  if (!node || typeof node !== 'object') return null;
  const type = node.type;
  const attrs = node.attrs && typeof node.attrs === 'object' ? node.attrs : {};
  const content = Array.isArray(node.content) ? node.content : null;

  try {
    return renderNodeByType({ node, type, attrs, content, attachments, onIssueKeyClick });
  } catch {
    return null;
  }
}

function renderNodeByType({ node, type, attrs, content, attachments, onIssueKeyClick }) {
  {
    switch (type) {
      case 'doc':
        return (
          <div className="adf">
            <Children nodes={content} attachments={attachments} onIssueKeyClick={onIssueKeyClick} />
          </div>
        );
      case 'paragraph':
        return (
          <p>
            <Children nodes={content} attachments={attachments} onIssueKeyClick={onIssueKeyClick} />
          </p>
        );
      case 'text':
        return renderTextWithClick(node, onIssueKeyClick);
      case 'hardBreak':
        return <br />;
      case 'heading': {
        const level = Math.min(6, Math.max(1, Number(attrs.level) || 1));
        const Tag = `h${level}`;
        return (
          <Tag>
            <Children nodes={content} attachments={attachments} onIssueKeyClick={onIssueKeyClick} />
          </Tag>
        );
      }
      case 'bulletList':
        return (
          <ul>
            <Children nodes={content} attachments={attachments} onIssueKeyClick={onIssueKeyClick} />
          </ul>
        );
      case 'orderedList':
        return (
          <ol start={attrs.order}>
            <Children nodes={content} attachments={attachments} onIssueKeyClick={onIssueKeyClick} />
          </ol>
        );
      case 'listItem':
        return (
          <li>
            <Children nodes={content} attachments={attachments} onIssueKeyClick={onIssueKeyClick} />
          </li>
        );
      case 'codeBlock': {
        const text = (content || []).map((c) => c?.text ?? '').join('');
        return (
          <pre className="adf-code">
            {attrs.language ? <span className="adf-code-lang">{attrs.language}</span> : null}
            <code>{text}</code>
          </pre>
        );
      }
      case 'blockquote':
        return (
          <blockquote>
            <Children nodes={content} attachments={attachments} onIssueKeyClick={onIssueKeyClick} />
          </blockquote>
        );
      case 'rule':
        return <hr />;
      case 'panel': {
        const panelType = attrs.panelType || 'info';
        return (
          <div className={`adf-panel adf-panel-${panelType}`}>
            <Children nodes={content} attachments={attachments} onIssueKeyClick={onIssueKeyClick} />
          </div>
        );
      }
      case 'table':
        return (
          <div className="adf-table-wrap">
            <table>
              <tbody>
                <Children nodes={content} attachments={attachments} onIssueKeyClick={onIssueKeyClick} />
              </tbody>
            </table>
          </div>
        );
      case 'tableRow':
        return (
          <tr>
            <Children nodes={content} attachments={attachments} onIssueKeyClick={onIssueKeyClick} />
          </tr>
        );
      case 'tableHeader':
        return (
          <th colSpan={attrs.colspan} rowSpan={attrs.rowspan}>
            <Children nodes={content} attachments={attachments} onIssueKeyClick={onIssueKeyClick} />
          </th>
        );
      case 'tableCell':
        return (
          <td colSpan={attrs.colspan} rowSpan={attrs.rowspan}>
            <Children nodes={content} attachments={attachments} onIssueKeyClick={onIssueKeyClick} />
          </td>
        );
      case 'mention': {
        const text = typeof attrs.text === 'string' ? attrs.text.replace(/^@/, '') : '';
        return <span className="adf-mention">@{text}</span>;
      }
      case 'emoji':
        return <span>{attrs.text || attrs.shortName || ''}</span>;
      case 'date': {
        const ts = Number(attrs.timestamp);
        const d = Number.isFinite(ts) ? new Date(ts) : null;
        return <span className="adf-date">{d ? d.toLocaleDateString() : ''}</span>;
      }
      case 'status':
        return <span className={`adf-status adf-status-${attrs.color || 'neutral'}`}>{attrs.text}</span>;
      case 'inlineCard':
      case 'blockCard':
      case 'embedCard': {
        const href = attrs.url;
        if (!href) return null;
        const url = safeUrl(href);
        if (!url) return <span>{href}</span>;
        return (
          <a href={href} target="_blank" rel="noreferrer noopener">
            {href}
          </a>
        );
      }
      case 'mediaSingle':
      case 'mediaGroup':
        return (
          <div className="adf-media-wrap">
            <Children nodes={content} attachments={attachments} onIssueKeyClick={onIssueKeyClick} />
          </div>
        );
      case 'media':
      case 'mediaInline': {
        const alt = attrs.alt;
        const attachment = findAttachment(attachments, alt);
        return <AttachmentChip attachment={attachment} alt={alt} />;
      }
      case 'expand':
      case 'nestedExpand':
        return (
          <details>
            <summary>{attrs.title || 'Details'}</summary>
            <Children nodes={content} attachments={attachments} onIssueKeyClick={onIssueKeyClick} />
          </details>
        );
      case 'taskList':
        return (
          <ul className="adf-tasks">
            <Children nodes={content} attachments={attachments} onIssueKeyClick={onIssueKeyClick} />
          </ul>
        );
      case 'taskItem':
        return (
          <li>
            <input type="checkbox" disabled checked={attrs.state === 'DONE'} readOnly />
            <Children nodes={content} attachments={attachments} onIssueKeyClick={onIssueKeyClick} />
          </li>
        );
      case 'decisionList':
        return (
          <ul className="adf-decisions">
            <Children nodes={content} attachments={attachments} onIssueKeyClick={onIssueKeyClick} />
          </ul>
        );
      case 'decisionItem':
        return (
          <li>
            ✔ <Children nodes={content} attachments={attachments} onIssueKeyClick={onIssueKeyClick} />
          </li>
        );
      case 'placeholder':
        return null;
      default:
        if (content) {
          return <Children nodes={content} attachments={attachments} onIssueKeyClick={onIssueKeyClick} />;
        }
        return null;
    }
  }
}

function renderTextWithClick(node, onIssueKeyClick) {
  let content = node.text ?? '';
  const marks = Array.isArray(node.marks) ? node.marks : [];
  let element = content;
  for (const mark of marks) {
    if (!mark || typeof mark !== 'object') continue;
    switch (mark.type) {
      case 'strong':
        element = <strong>{element}</strong>;
        break;
      case 'em':
        element = <em>{element}</em>;
        break;
      case 'underline':
        element = <u>{element}</u>;
        break;
      case 'strike':
        element = <s>{element}</s>;
        break;
      case 'code':
        element = <code>{element}</code>;
        break;
      case 'subsup':
        element = mark.attrs?.type === 'sup' ? <sup>{element}</sup> : <sub>{element}</sub>;
        break;
      case 'textColor': {
        const color = mark.attrs?.color;
        if (typeof color === 'string' && COLOR_RE.test(color)) {
          element = <span style={{ color }}>{element}</span>;
        }
        break;
      }
      case 'link':
        element = renderLink(mark, element, 0, onIssueKeyClick);
        break;
      default:
        break;
    }
  }
  return element;
}

export default function AdfRenderer({ doc, attachments = [], onIssueKeyClick }) {
  if (!doc || typeof doc !== 'object') return null;
  return <AdfNode node={doc} attachments={attachments} onIssueKeyClick={onIssueKeyClick} />;
}

export function FieldValue({ value, attachments, onIssueKeyClick }) {
  if (typeof value === 'string') {
    return <span>{value}</span>;
  }
  if (value && typeof value === 'object' && value.adf) {
    return <AdfRenderer doc={value.adf} attachments={attachments} onIssueKeyClick={onIssueKeyClick} />;
  }
  return null;
}
