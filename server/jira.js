import { readFileSync } from 'node:fs';

export const SEARCH_FIELDS = [
  'summary', 'status', 'priority', 'assignee', 'reporter', 'issuetype',
  'labels', 'components', 'created', 'updated', 'description',
];

export const DETAIL_FIELDS = '*all';

const BLOCK_END_TYPES = new Set(['paragraph', 'heading', 'blockquote', 'codeBlock', 'rule', 'panel', 'tableRow']);

function adfNodeToText(node) {
  if (!node || typeof node !== 'object') return '';
  const { type, content } = node;

  if (type === 'text') return node.text ?? '';
  if (type === 'hardBreak') return '\n';
  if (type === 'mention') return node.attrs?.text ?? '';
  if (type === 'emoji') return node.attrs?.shortName ?? '';
  if (type === 'inlineCard') return node.attrs?.url ?? '';

  const childTexts = Array.isArray(content) ? content.map(adfNodeToText) : [];

  if (type === 'tableCell' || type === 'tableHeader') {
    return childTexts.join(' | ');
  }

  let text = childTexts.join('');

  if (type === 'listItem') {
    text = `- ${text}`;
  }

  if (BLOCK_END_TYPES.has(type)) {
    text = `${text}\n`;
  }

  return text;
}

export function adfToText(adf) {
  if (adf === null || adf === undefined) return '';
  if (typeof adf === 'string') return adf;

  const content = Array.isArray(adf.content) ? adf.content : [];
  const raw = content.map(adfNodeToText).join('');
  return raw.replace(/\n{3,}/g, '\n\n').trim();
}

export function normalizeIssue(raw, baseUrl) {
  const fields = raw?.fields ?? {};
  return {
    key: raw.key,
    url: `${baseUrl}/browse/${raw.key}`,
    summary: fields.summary ?? '',
    type: fields.issuetype?.name ?? null,
    status: fields.status?.name ?? null,
    priority: fields.priority?.name ?? null,
    assignee: fields.assignee?.displayName ?? null,
    reporter: fields.reporter?.displayName ?? null,
    labels: fields.labels ?? [],
    components: (fields.components ?? []).map((c) => c.name),
    created: fields.created ?? null,
    updated: fields.updated ?? null,
    description: adfToText(fields.description),
  };
}

const STATUS_CATEGORY_KEYS = new Set(['new', 'indeterminate', 'done']);
const SKIP_CUSTOM_FIELD_NAMES = /^(Rank|Development)$/i;

function toPerson(p) {
  if (!p) return null;
  return { displayName: p.displayName ?? null, accountId: p.accountId ?? null };
}

function statusCategoryKey(status) {
  const key = status?.statusCategory?.key;
  return STATUS_CATEGORY_KEYS.has(key) ? key : null;
}

function normalizeIssueRef(issue, baseUrl) {
  if (!issue) return null;
  const f = issue.fields ?? {};
  return {
    key: issue.key,
    summary: f.summary ?? null,
    status: f.status?.name ?? null,
    statusCategory: statusCategoryKey(f.status),
    type: f.issuetype?.name ?? null,
    priority: f.priority?.name ?? null,
    url: `${baseUrl}/browse/${issue.key}`,
  };
}

function normalizeLinks(issuelinks, baseUrl) {
  const links = [];
  for (const link of issuelinks ?? []) {
    if (link.outwardIssue) {
      links.push({ id: link.id, label: link.type?.outward ?? '', issue: normalizeIssueRef(link.outwardIssue, baseUrl) });
    } else if (link.inwardIssue) {
      links.push({ id: link.id, label: link.type?.inward ?? '', issue: normalizeIssueRef(link.inwardIssue, baseUrl) });
    }
  }
  return links;
}

function toAdfOrNull(value) {
  if (value && typeof value === 'object' && value.type === 'doc') return value;
  if (typeof value === 'string' && value !== '') {
    return { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: value }] }] };
  }
  return null;
}

function normalizeTimeTracking(tt) {
  if (!tt) return null;
  const keys = ['originalEstimate', 'remainingEstimate', 'timeSpent'];
  if (!keys.some((k) => tt[k] !== undefined)) return null;
  const result = {};
  for (const k of keys) result[k] = tt[k] ?? null;
  return result;
}

function normalizeAttachment(att) {
  const id = String(att.id);
  const mimeType = att.mimeType ?? 'application/octet-stream';
  return {
    id,
    filename: att.filename ?? null,
    mimeType,
    size: att.size ?? null,
    created: att.created ?? null,
    author: toPerson(att.author),
    contentUrl: `/api/attachments/${id}`,
    thumbnailUrl: mimeType.startsWith('image/') ? `/api/attachments/${id}/thumbnail` : null,
  };
}

function normalizeComments(commentField) {
  const list = commentField?.comments ?? [];
  const sorted = [...list].sort((a, b) => {
    if (a.created < b.created) return -1;
    if (a.created > b.created) return 1;
    return 0;
  });
  return sorted.map((c) => ({
    id: c.id,
    author: toPerson(c.author),
    created: c.created ?? null,
    updated: c.updated ?? null,
    bodyAdf: c.body && typeof c.body === 'object' && c.body.type === 'doc' ? c.body : null,
  }));
}

function objectToDisplayString(obj) {
  if (obj.displayName) return obj.displayName;
  if (obj.value !== undefined && obj.value !== null) {
    let s = String(obj.value);
    if (obj.child && obj.child.value !== undefined && obj.child.value !== null) {
      s += ` / ${obj.child.value}`;
    }
    return s;
  }
  if (obj.name !== undefined && obj.name !== null) {
    if (obj.state !== undefined && obj.state !== null) {
      return `${obj.name} (${String(obj.state).toLowerCase()})`;
    }
    return obj.name;
  }
  if (obj.key !== undefined && obj.key !== null) return obj.key;
  return null;
}

export function customFieldToDisplay(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (Array.isArray(raw)) {
    if (raw.length === 0) return null;
    const parts = raw
      .map((item) => {
        if (item === null || item === undefined || item === '') return null;
        if (typeof item === 'string') return item;
        if (typeof item === 'number' || typeof item === 'boolean') return String(item);
        if (typeof item === 'object') return objectToDisplayString(item);
        return null;
      })
      .filter((s) => s !== null && s !== '');
    return parts.length > 0 ? parts.join(', ') : null;
  }
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
  if (typeof raw === 'object') {
    if (raw.type === 'doc') return { adf: raw };
    return objectToDisplayString(raw);
  }
  return null;
}

function normalizeCustomFields(fields, names) {
  const result = [];
  for (const id of Object.keys(fields)) {
    if (!id.startsWith('customfield_')) continue;
    const name = names?.[id] ?? id;
    if (SKIP_CUSTOM_FIELD_NAMES.test(name)) continue;
    const value = customFieldToDisplay(fields[id]);
    if (value === null) continue;
    if (typeof value === 'string' && value.startsWith('{')) continue;
    result.push({ id, name, value });
  }
  result.sort((a, b) => a.name.localeCompare(b.name));
  return result;
}

export function normalizeIssueDetail(raw, baseUrl) {
  const fields = raw?.fields ?? {};
  const names = raw?.names ?? {};
  return {
    key: raw.key,
    url: `${baseUrl}/browse/${raw.key}`,
    summary: fields.summary ?? '',
    type: fields.issuetype?.name ?? null,
    status: fields.status?.name ?? null,
    statusCategory: statusCategoryKey(fields.status),
    priority: fields.priority?.name ?? null,
    resolution: fields.resolution?.name ?? null,
    assignee: toPerson(fields.assignee),
    reporter: toPerson(fields.reporter),
    creator: toPerson(fields.creator),
    created: fields.created ?? null,
    updated: fields.updated ?? null,
    resolved: fields.resolutiondate ?? null,
    dueDate: fields.duedate ?? null,
    labels: fields.labels ?? [],
    components: (fields.components ?? []).map((c) => c.name),
    fixVersions: (fields.fixVersions ?? []).map((v) => v.name),
    affectsVersions: (fields.versions ?? []).map((v) => v.name),
    parent: fields.parent ? normalizeIssueRef(fields.parent, baseUrl) : null,
    subtasks: (fields.subtasks ?? []).map((s) => normalizeIssueRef(s, baseUrl)),
    links: normalizeLinks(fields.issuelinks, baseUrl),
    descriptionAdf: toAdfOrNull(fields.description),
    environmentAdf: toAdfOrNull(fields.environment),
    timeTracking: normalizeTimeTracking(fields.timetracking),
    attachments: (fields.attachment ?? []).map(normalizeAttachment),
    comments: normalizeComments(fields.comment),
    commentTotal: fields.comment?.total ?? (fields.comment?.comments ?? []).length,
    customFields: normalizeCustomFields(fields, names),
    fetchedAt: new Date().toISOString(),
  };
}

function extractErrorMessage(body, statusText) {
  if (body && Array.isArray(body.errorMessages) && body.errorMessages.length > 0) {
    return body.errorMessages[0];
  }
  if (body && body.errors && typeof body.errors === 'object') {
    const values = Object.values(body.errors);
    if (values.length > 0) return values[0];
  }
  return statusText;
}

async function throwJiraError(res) {
  let body = null;
  try {
    body = await res.json();
  } catch {
    // ignore unparsable error body
  }
  const message = extractErrorMessage(body, res.statusText);
  const err = new Error(`Jira ${res.status}: ${message}`);
  err.status = res.status;
  throw err;
}

export function createJiraClient({ baseUrl, email, apiToken, fetchImpl = fetch }) {
  const base = baseUrl.replace(/\/+$/, '');
  const authHeader = `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`;
  const headers = {
    Authorization: authHeader,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  async function search(jql) {
    const issues = [];
    let nextPageToken;
    let pages = 0;

    for (;;) {
      pages += 1;
      if (pages > 50) {
        throw new Error('Too many results (>5000); narrow your JQL');
      }

      const body = {
        jql,
        fields: SEARCH_FIELDS,
        maxResults: 100,
        ...(nextPageToken ? { nextPageToken } : {}),
      };

      const res = await fetchImpl(`${base}/rest/api/3/search/jql`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!res.ok) await throwJiraError(res);

      const data = await res.json();
      for (const raw of data.issues ?? []) {
        issues.push(normalizeIssue(raw, base));
      }

      if (data.nextPageToken && data.isLast !== true) {
        nextPageToken = data.nextPageToken;
      } else {
        break;
      }
    }

    return issues;
  }

  async function getIssueDetail(key) {
    const res = await fetchImpl(
      `${base}/rest/api/3/issue/${encodeURIComponent(key)}?fields=${DETAIL_FIELDS}&expand=names`,
      { headers },
    );
    if (!res.ok) await throwJiraError(res);
    const raw = await res.json();

    const commentField = raw.fields?.comment;
    if (commentField && commentField.total > (commentField.comments?.length ?? 0)) {
      const allComments = [...(commentField.comments ?? [])];
      while (allComments.length < commentField.total && allComments.length < 500) {
        const cres = await fetchImpl(
          `${base}/rest/api/3/issue/${encodeURIComponent(key)}/comment?startAt=${allComments.length}&maxResults=100&orderBy=created`,
          { headers },
        );
        if (!cres.ok) await throwJiraError(cres);
        const cdata = await cres.json();
        const newComments = cdata.comments ?? [];
        if (newComments.length === 0) break;
        allComments.push(...newComments);
      }
      raw.fields.comment.comments = allComments;
    }

    return normalizeIssueDetail(raw, base);
  }

  async function getAttachment(id, { thumbnail = false } = {}) {
    const path = thumbnail
      ? `${base}/rest/api/3/attachment/thumbnail/${id}?redirect=false&fallbackToDefault=false`
      : `${base}/rest/api/3/attachment/content/${id}?redirect=false`;
    const res = await fetchImpl(path, { headers: { ...headers, Accept: '*/*' } });
    if (!res.ok) await throwJiraError(res);
    return {
      body: res.body,
      contentType: res.headers.get('content-type') || 'application/octet-stream',
      contentLength: Number(res.headers.get('content-length')) || null,
    };
  }

  async function setLabel(key, label, op) {
    const res = await fetchImpl(`${base}/rest/api/3/issue/${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ update: { labels: [{ [op]: label }] } }),
    });
    if (!res.ok && res.status !== 204) await throwJiraError(res);
  }

  return {
    baseUrl: base,
    search,
    addLabel: (key, label) => setLabel(key, label, 'add'),
    removeLabel: (key, label) => setLabel(key, label, 'remove'),
    getIssueDetail,
    getAttachment,
  };
}

function loadFixtureIssues() {
  const raw = readFileSync(new URL('../test/fixtures/issues.json', import.meta.url));
  return JSON.parse(raw);
}

function loadIssueDetailTemplate() {
  const raw = readFileSync(new URL('../test/fixtures/issue-detail.json', import.meta.url));
  return JSON.parse(raw);
}

const MOCK_OVERRIDE_FIELDS = [
  'summary', 'status', 'priority', 'assignee', 'reporter', 'issuetype',
  'labels', 'components', 'created', 'updated', 'description',
];

const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

export function createMockJiraClient({ issues, baseUrl = 'https://mock.atlassian.net' } = {}) {
  const base = baseUrl.replace(/\/+$/, '');
  const rawIssues = issues ?? loadFixtureIssues();
  const byKey = new Map(rawIssues.map((issue) => [issue.key, issue]));
  const calls = [];

  function delay() {
    if (process.env.NODE_ENV === 'test' || process.env.VITEST) return Promise.resolve();
    return new Promise((resolve) => setTimeout(resolve, 150));
  }

  async function search(jql) {
    await delay();
    let list = [...byKey.values()];
    const match = /LIMIT=(\d+)/.exec(jql ?? '');
    if (match) {
      list = list.slice(0, Number(match[1]));
    }
    return list.map((raw) => normalizeIssue(raw, base));
  }

  function requireIssue(key) {
    const issue = byKey.get(key);
    if (!issue) {
      const err = new Error(`Jira 404: Issue does not exist`);
      err.status = 404;
      throw err;
    }
    return issue;
  }

  async function addLabel(key, label) {
    const issue = requireIssue(key);
    issue.fields.labels = issue.fields.labels ?? [];
    if (!issue.fields.labels.includes(label)) issue.fields.labels.push(label);
    calls.push({ op: 'add', key, label });
  }

  async function removeLabel(key, label) {
    const issue = requireIssue(key);
    issue.fields.labels = (issue.fields.labels ?? []).filter((l) => l !== label);
    calls.push({ op: 'remove', key, label });
  }

  async function getIssueDetail(key) {
    await delay();
    const issue = requireIssue(key);
    const template = loadIssueDetailTemplate();
    const merged = structuredClone(template);
    merged.key = key;
    merged.fields = merged.fields ?? {};
    for (const field of MOCK_OVERRIDE_FIELDS) {
      merged.fields[field] = issue.fields[field] ?? null;
    }
    return normalizeIssueDetail(merged, base);
  }

  async function getAttachment(id) {
    await delay();
    const template = loadIssueDetailTemplate();
    const found = (template.fields?.attachment ?? []).find((a) => String(a.id) === String(id));
    if (!found) {
      const err = new Error('Jira 404: Attachment does not exist');
      err.status = 404;
      throw err;
    }
    return {
      body: Buffer.from(TINY_PNG_BASE64, 'base64'),
      contentType: 'image/png',
      contentLength: null,
    };
  }

  return { baseUrl: base, search, addLabel, removeLabel, getIssueDetail, getAttachment, calls };
}

export function createJiraFromEnv(env = process.env) {
  if (env.JIRA_MOCK === '1') {
    return createMockJiraClient({});
  }
  const { JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN } = env;
  if (!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_API_TOKEN) {
    throw new Error('Missing Jira config: set JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN in .env (or JIRA_MOCK=1)');
  }
  return createJiraClient({ baseUrl: JIRA_BASE_URL, email: JIRA_EMAIL, apiToken: JIRA_API_TOKEN });
}
