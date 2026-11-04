import {
  createSession as dbCreateSession,
  getSession as dbGetSession,
  listSessions as dbListSessions,
  setSyncLabels as dbSetSyncLabels,
  deleteSession as dbDeleteSession,
  getCategories,
  upsertIssues,
  getIssue,
  getQueue as dbGetQueue,
  setDecision,
  getDecision,
  getLastDecision,
  deleteDecision,
  markLabelSynced,
  listDecisions,
  listIssuesWithDecisions,
  saveIssueDetail,
  getCachedIssueDetail,
  getStats as dbGetStats,
} from './db.js';

const RESERVED_HOTKEYS = new Set(['s', 'u', 'o', 'n', '?']);
const DETAIL_CACHE_MS = 10 * 60 * 1000;
const CSV_HEADER = 'key,summary,category,status,priority,assignee,note,decided_at,url';

export class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

function csvField(value) {
  let str = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\n]/.test(str)) {
    str = `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function validateCategories(categories) {
  if (!categories) return;
  const hotkeys = new Set();
  let rejectCount = 0;
  for (const cat of categories) {
    if (!cat.name || !String(cat.name).trim()) {
      throw new ValidationError('Category name is required');
    }
    if (!cat.hotkey || typeof cat.hotkey !== 'string' || cat.hotkey.length !== 1) {
      throw new ValidationError('Category hotkey must be a single character');
    }
    const hotkey = cat.hotkey.toLowerCase();
    if (RESERVED_HOTKEYS.has(hotkey)) {
      throw new ValidationError(`Hotkey "${hotkey}" is reserved`);
    }
    if (hotkeys.has(hotkey)) {
      throw new ValidationError(`Duplicate hotkey "${hotkey}"`);
    }
    hotkeys.add(hotkey);
    if (cat.isReject) rejectCount += 1;
  }
  if (rejectCount > 1) {
    throw new ValidationError('At most one category may be isReject');
  }
}

export function createTriageService({ db, jira }) {
  function requireSession(id) {
    const session = dbGetSession(db, id);
    if (!session) throw new NotFoundError('Session not found');
    return session;
  }

  function requireCategory(sessionId, categoryId) {
    const categories = getCategories(db, sessionId);
    const category = categories.find((c) => c.id === categoryId);
    if (!category) throw new ValidationError('Category not in session');
    return category;
  }

  async function createSession({ name, jql, categories }) {
    if (!name || !String(name).trim()) throw new ValidationError('name is required');
    if (!jql || !String(jql).trim()) throw new ValidationError('jql is required');
    const normalizedCategories = categories?.map((c) => ({
      ...c,
      hotkey: typeof c.hotkey === 'string' ? c.hotkey.toLowerCase() : c.hotkey,
    }));
    validateCategories(normalizedCategories);

    const session = dbCreateSession(db, {
      name: String(name),
      jql: String(jql),
      categories: normalizedCategories,
    });

    try {
      const issues = await jira.search(session.jql);
      upsertIssues(db, session.id, issues);
    } catch (err) {
      dbDeleteSession(db, session.id);
      throw err;
    }

    return getSession(session.id);
  }

  function listSessions() {
    return dbListSessions(db);
  }

  function getSession(id) {
    const session = requireSession(id);
    const categories = getCategories(db, id);
    return { ...session, categories };
  }

  async function refresh(id) {
    const session = requireSession(id);
    const issues = await jira.search(session.jql);
    const { added, updated } = upsertIssues(db, id, issues);
    return { added, updated, session: dbGetSession(db, id) };
  }

  function setSyncLabels(id, bool) {
    requireSession(id);
    return dbSetSyncLabels(db, id, !!bool);
  }

  function deleteSession(id) {
    requireSession(id);
    dbDeleteSession(db, id);
  }

  function getQueue(id) {
    requireSession(id);
    return dbGetQueue(db, id);
  }

  async function decide(id, { issueKey, categoryId, note }) {
    const session = requireSession(id);
    const issue = getIssue(db, id, issueKey);
    if (!issue) throw new NotFoundError('Issue not in session');
    const category = requireCategory(id, categoryId);

    const existing = getDecision(db, id, issueKey);
    let warning;
    if (
      existing &&
      existing.status === 'decided' &&
      existing.labelSynced &&
      existing.categoryId !== category.id
    ) {
      const oldCategory = getCategories(db, id).find((c) => c.id === existing.categoryId);
      if (oldCategory?.jiraLabel && oldCategory.jiraLabel !== category.jiraLabel) {
        try {
          await jira.removeLabel(issueKey, oldCategory.jiraLabel);
        } catch (err) {
          warning = `Saved locally, but Jira label failed: ${err.message}`;
        }
      }
    }

    setDecision(db, id, { issueKey, categoryId, status: 'decided', note: note ?? '' });

    if (session.syncLabels && category.jiraLabel) {
      try {
        await jira.addLabel(issueKey, category.jiraLabel);
        markLabelSynced(db, id, issueKey, true);
      } catch (err) {
        warning = `Saved locally, but Jira label failed: ${err.message}`;
      }
    }

    return {
      decision: getDecision(db, id, issueKey),
      ...(warning ? { warning } : {}),
      session: dbGetSession(db, id),
    };
  }

  function skip(id, { issueKey }) {
    requireSession(id);
    const issue = getIssue(db, id, issueKey);
    if (!issue) throw new NotFoundError('Issue not in session');
    const decision = setDecision(db, id, { issueKey, categoryId: null, status: 'skipped' });
    return { decision, session: dbGetSession(db, id) };
  }

  async function removeDecisionAndLabel(id, issueKey, decision) {
    let warning;
    if (decision.status === 'decided' && decision.labelSynced) {
      const category = getCategories(db, id).find((c) => c.id === decision.categoryId);
      if (category?.jiraLabel) {
        try {
          await jira.removeLabel(issueKey, category.jiraLabel);
        } catch (err) {
          warning = `Saved locally, but Jira label failed: ${err.message}`;
        }
      }
    }
    deleteDecision(db, id, issueKey);
    return warning;
  }

  async function undo(id) {
    requireSession(id);
    const last = getLastDecision(db, id);
    if (!last) return { issueKey: null, session: dbGetSession(db, id) };
    const warning = await removeDecisionAndLabel(id, last.issueKey, last);
    return {
      issueKey: last.issueKey,
      ...(warning ? { warning } : {}),
      session: dbGetSession(db, id),
    };
  }

  async function reopen(id, issueKey) {
    requireSession(id);
    const decision = getDecision(db, id, issueKey);
    if (!decision) throw new NotFoundError('Decision not found');
    const warning = await removeDecisionAndLabel(id, issueKey, decision);
    return {
      issueKey,
      ...(warning ? { warning } : {}),
      session: dbGetSession(db, id),
    };
  }

  async function syncLabels(id) {
    requireSession(id);
    const categories = getCategories(db, id);
    const categoryById = new Map(categories.map((c) => [c.id, c]));
    const decisions = listDecisions(db, id).filter(
      (d) => d.status === 'decided' && !d.labelSynced && categoryById.get(d.categoryId)?.jiraLabel
    );
    let synced = 0;
    const failed = [];
    for (const decision of decisions) {
      const category = categoryById.get(decision.categoryId);
      try {
        await jira.addLabel(decision.issueKey, category.jiraLabel);
        markLabelSynced(db, id, decision.issueKey, true);
        synced += 1;
      } catch (err) {
        failed.push({ issueKey: decision.issueKey, error: err.message });
      }
    }
    return { synced, failed };
  }

  function getResults(id) {
    const session = requireSession(id);
    const categories = getCategories(db, id);
    const decisions = listDecisions(db, id);

    const groups = categories.map((category) => {
      const items = decisions
        .filter((d) => d.status === 'decided' && d.categoryId === category.id)
        .map((d) => ({ issue: d.issue, note: d.note, decidedAt: d.decidedAt }));
      const jql =
        items.length > 0
          ? `key in (${items.map((item) => item.issue.key).join(', ')})`
          : '';
      return { category, items, jql };
    });

    const skipped = decisions
      .filter((d) => d.status === 'skipped')
      .map((d) => d.issue);

    return { session, categories, groups, skipped };
  }

  function resultsCsv(id) {
    const { groups } = getResults(id);
    const rows = [CSV_HEADER];
    for (const { category, items } of groups) {
      for (const { issue, note, decidedAt } of items) {
        rows.push(
          [
            issue.key,
            issue.summary,
            category.name,
            issue.status ?? '',
            issue.priority ?? '',
            issue.assignee ?? '',
            note,
            decidedAt,
            issue.url,
          ]
            .map(csvField)
            .join(',')
        );
      }
    }
    return `${rows.join('\n')}\n`;
  }

  function listIssues(id) {
    requireSession(id);
    return listIssuesWithDecisions(db, id);
  }

  async function getIssueDetail(id, key, { refresh: forceRefresh = false } = {}) {
    requireSession(id);
    const issue = getIssue(db, id, key);
    if (!issue) throw new NotFoundError('Issue not in session');

    const cached = getCachedIssueDetail(db, key);
    if (cached && !forceRefresh) {
      const age = Date.now() - Date.parse(cached.fetchedAt);
      if (age < DETAIL_CACHE_MS) return cached;
    }

    try {
      const detail = await jira.getIssueDetail(key);
      saveIssueDetail(db, detail);
      return detail;
    } catch (err) {
      if (cached) return { ...cached, stale: true };
      throw err;
    }
  }

  function getStats(id) {
    requireSession(id);
    return dbGetStats(db, id);
  }

  async function getAttachment(attachmentId, { thumbnail } = {}) {
    if (!/^\d+$/.test(String(attachmentId))) {
      throw new ValidationError('Invalid attachment id');
    }
    return jira.getAttachment(attachmentId, { thumbnail });
  }

  return {
    createSession,
    listSessions,
    getSession,
    refresh,
    setSyncLabels,
    deleteSession,
    getQueue,
    decide,
    skip,
    undo,
    reopen,
    syncLabels,
    getResults,
    resultsCsv,
    listIssues,
    getIssueDetail,
    getStats,
    getAttachment,
  };
}
