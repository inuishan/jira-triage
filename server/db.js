import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const DEFAULT_CATEGORIES = [
  { name: 'Accept', jiraLabel: null, hotkey: 'a', isReject: false },
  { name: 'Reject', jiraLabel: null, hotkey: 'r', isReject: true },
];

export function openDb(path = 'data/triage.db') {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON;');
  if (path !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;');
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      jql TEXT NOT NULL,
      sync_labels INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY,
      session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      jira_label TEXT,
      hotkey TEXT NOT NULL,
      position INTEGER NOT NULL,
      is_reject INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS issues (
      session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      issue_key TEXT NOT NULL,
      data TEXT NOT NULL,
      position INTEGER NOT NULL,
      fetched_at TEXT NOT NULL,
      PRIMARY KEY(session_id, issue_key)
    );
    CREATE TABLE IF NOT EXISTS decisions (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      issue_key TEXT NOT NULL,
      category_id INTEGER REFERENCES categories(id),
      status TEXT NOT NULL CHECK(status IN ('decided','skipped')),
      note TEXT NOT NULL DEFAULT '',
      decided_at TEXT NOT NULL,
      label_synced INTEGER NOT NULL DEFAULT 0,
      UNIQUE(session_id, issue_key)
    );
    CREATE INDEX IF NOT EXISTS idx_decisions_session_seq ON decisions(session_id, seq);
    CREATE TABLE IF NOT EXISTS issue_details (
      issue_key TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      fetched_at TEXT NOT NULL
    );
  `);
  return db;
}

function toCategory(row) {
  return {
    id: row.id,
    sessionId: row.session_id,
    name: row.name,
    jiraLabel: row.jira_label,
    hotkey: row.hotkey,
    position: row.position,
    isReject: !!row.is_reject,
  };
}

function toSession(row, counts) {
  return {
    id: row.id,
    name: row.name,
    jql: row.jql,
    syncLabels: !!row.sync_labels,
    createdAt: row.created_at,
    counts,
  };
}

function toDecision(row) {
  return {
    issueKey: row.issue_key,
    categoryId: row.category_id,
    status: row.status,
    note: row.note,
    decidedAt: row.decided_at,
    labelSynced: !!row.label_synced,
    seq: row.seq,
  };
}

function getCounts(db, sessionId) {
  const row = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM issues WHERE session_id = ?) AS total,
        (SELECT COUNT(*) FROM decisions WHERE session_id = ? AND status = 'decided') AS decided,
        (SELECT COUNT(*) FROM decisions WHERE session_id = ? AND status = 'skipped') AS skipped
      `
    )
    .get(sessionId, sessionId, sessionId);
  const total = row.total;
  const decided = row.decided;
  const skipped = row.skipped;
  return { total, decided, skipped, remaining: total - decided };
}

export function createSession(db, { name, jql, categories }) {
  const trimmedName = name.trim();
  const trimmedJql = jql.trim();
  const cats = categories && categories.length > 0 ? categories : DEFAULT_CATEGORIES;
  db.exec('BEGIN');
  try {
    const now = new Date().toISOString();
    const result = db
      .prepare('INSERT INTO sessions (name, jql, sync_labels, created_at) VALUES (?, ?, 0, ?)')
      .run(trimmedName, trimmedJql, now);
    const sessionId = Number(result.lastInsertRowid);
    const insertCat = db.prepare(
      'INSERT INTO categories (session_id, name, jira_label, hotkey, position, is_reject) VALUES (?, ?, ?, ?, ?, ?)'
    );
    cats.forEach((cat, index) => {
      const jiraLabel = cat.jiraLabel === '' || cat.jiraLabel == null ? null : cat.jiraLabel;
      insertCat.run(sessionId, cat.name, jiraLabel, cat.hotkey, index, cat.isReject ? 1 : 0);
    });
    db.exec('COMMIT');
    return getSession(db, sessionId);
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function getSession(db, id) {
  const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
  if (!row) return null;
  return toSession(row, getCounts(db, id));
}

export function listSessions(db) {
  const rows = db.prepare('SELECT * FROM sessions ORDER BY id DESC').all();
  return rows.map((row) => toSession(row, getCounts(db, row.id)));
}

export function setSyncLabels(db, id, bool) {
  db.prepare('UPDATE sessions SET sync_labels = ? WHERE id = ?').run(bool ? 1 : 0, id);
  return getSession(db, id);
}

export function deleteSession(db, id) {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
}

export function getCategories(db, sessionId) {
  const rows = db
    .prepare('SELECT * FROM categories WHERE session_id = ? ORDER BY position')
    .all(sessionId);
  return rows.map(toCategory);
}

export function upsertIssues(db, sessionId, issues) {
  let added = 0;
  let updated = 0;
  db.exec('BEGIN');
  try {
    const existsStmt = db.prepare(
      'SELECT 1 FROM issues WHERE session_id = ? AND issue_key = ?'
    );
    const upsertStmt = db.prepare(`
      INSERT INTO issues (session_id, issue_key, data, position, fetched_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(session_id, issue_key) DO UPDATE SET
        data = excluded.data,
        position = excluded.position,
        fetched_at = excluded.fetched_at
    `);
    const now = new Date().toISOString();
    issues.forEach((issue, index) => {
      const exists = existsStmt.get(sessionId, issue.key);
      if (exists) {
        updated += 1;
      } else {
        added += 1;
      }
      upsertStmt.run(sessionId, issue.key, JSON.stringify(issue), index, now);
    });
    db.exec('COMMIT');
    return { added, updated };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function getIssue(db, sessionId, key) {
  const row = db
    .prepare('SELECT * FROM issues WHERE session_id = ? AND issue_key = ?')
    .get(sessionId, key);
  if (!row) return null;
  return JSON.parse(row.data);
}

export function getQueue(db, sessionId) {
  const rows = db
    .prepare(
      `SELECT i.data FROM issues i
       LEFT JOIN decisions d ON d.session_id = i.session_id AND d.issue_key = i.issue_key
       WHERE i.session_id = ? AND (d.status IS NULL OR d.status = 'skipped')
       ORDER BY (d.status IS NOT NULL), d.seq, i.position`
    )
    .all(sessionId);
  return rows.map((row) => JSON.parse(row.data));
}

export function setDecision(db, sessionId, { issueKey, categoryId, status, note = '' }) {
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM decisions WHERE session_id = ? AND issue_key = ?').run(
      sessionId,
      issueKey
    );
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO decisions (session_id, issue_key, category_id, status, note, decided_at, label_synced)
       VALUES (?, ?, ?, ?, ?, ?, 0)`
    ).run(sessionId, issueKey, categoryId ?? null, status, note, now);
    db.exec('COMMIT');
    return getDecision(db, sessionId, issueKey);
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function getDecision(db, sessionId, issueKey) {
  const row = db
    .prepare('SELECT * FROM decisions WHERE session_id = ? AND issue_key = ?')
    .get(sessionId, issueKey);
  if (!row) return null;
  return toDecision(row);
}

export function getLastDecision(db, sessionId) {
  const row = db
    .prepare('SELECT * FROM decisions WHERE session_id = ? ORDER BY seq DESC LIMIT 1')
    .get(sessionId);
  if (!row) return null;
  return toDecision(row);
}

export function deleteDecision(db, sessionId, issueKey) {
  db.prepare('DELETE FROM decisions WHERE session_id = ? AND issue_key = ?').run(
    sessionId,
    issueKey
  );
}

export function markLabelSynced(db, sessionId, issueKey, bool) {
  db.prepare(
    'UPDATE decisions SET label_synced = ? WHERE session_id = ? AND issue_key = ?'
  ).run(bool ? 1 : 0, sessionId, issueKey);
}

export function listDecisions(db, sessionId) {
  const rows = db
    .prepare(
      `SELECT d.*, i.data AS issue_data FROM decisions d
       LEFT JOIN issues i ON i.session_id = d.session_id AND i.issue_key = d.issue_key
       WHERE d.session_id = ? ORDER BY d.seq ASC`
    )
    .all(sessionId);
  return rows.map((row) => ({
    ...toDecision(row),
    issue: row.issue_data ? JSON.parse(row.issue_data) : null,
  }));
}

export function saveIssueDetail(db, detail) {
  db.prepare(
    `INSERT INTO issue_details (issue_key, data, fetched_at)
     VALUES (?, ?, ?)
     ON CONFLICT(issue_key) DO UPDATE SET
       data = excluded.data,
       fetched_at = excluded.fetched_at`
  ).run(detail.key, JSON.stringify(detail), detail.fetchedAt);
}

export function getCachedIssueDetail(db, key) {
  const row = db.prepare('SELECT * FROM issue_details WHERE issue_key = ?').get(key);
  if (!row) return null;
  return JSON.parse(row.data);
}

export function listIssuesWithDecisions(db, sessionId) {
  const rows = db
    .prepare(
      `SELECT i.data, i.position, d.status AS d_status, d.category_id AS d_category_id,
              d.note AS d_note, d.decided_at AS d_decided_at
       FROM issues i
       LEFT JOIN decisions d ON d.session_id = i.session_id AND d.issue_key = i.issue_key
       WHERE i.session_id = ?
       ORDER BY i.position`
    )
    .all(sessionId);
  return rows.map((row) => {
    const issue = JSON.parse(row.data);
    return {
      key: issue.key,
      summary: issue.summary,
      type: issue.type,
      status: issue.status,
      priority: issue.priority,
      assignee: issue.assignee,
      url: issue.url,
      position: row.position,
      decision:
        row.d_status == null
          ? null
          : {
              status: row.d_status,
              categoryId: row.d_category_id,
              note: row.d_note,
              decidedAt: row.d_decided_at,
            },
    };
  });
}

function localYmd(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function computeBreakdown(items) {
  const dims = ['priority', 'type', 'status', 'assignee'];
  const breakdown = {};
  for (const dim of dims) {
    const groups = new Map();
    for (const item of items) {
      const value = item[dim] == null ? 'None' : item[dim];
      if (!groups.has(value)) {
        groups.set(value, { value, total: 0, undecided: 0, byCategory: {} });
      }
      const group = groups.get(value);
      group.total += 1;
      const decision = item.decision;
      if (!decision || decision.status === 'skipped') {
        group.undecided += 1;
      } else if (decision.status === 'decided') {
        const key = String(decision.categoryId);
        group.byCategory[key] = (group.byCategory[key] || 0) + 1;
      }
    }
    let rows = [...groups.values()];
    rows.sort((a, b) => b.total - a.total || (a.value < b.value ? -1 : a.value > b.value ? 1 : 0));
    if (dim === 'assignee' && rows.length > 10) {
      const top = rows.slice(0, 10);
      const rest = rows.slice(10);
      const other = { value: 'Other', total: 0, undecided: 0, byCategory: {} };
      for (const row of rest) {
        other.total += row.total;
        other.undecided += row.undecided;
        for (const [catId, count] of Object.entries(row.byCategory)) {
          other.byCategory[catId] = (other.byCategory[catId] || 0) + count;
        }
      }
      rows = [...top, other];
      rows.sort((a, b) => b.total - a.total || (a.value < b.value ? -1 : a.value > b.value ? 1 : 0));
    }
    breakdown[dim] = rows;
  }
  return breakdown;
}

export function getStats(db, sessionId, now = new Date()) {
  const counts = getCounts(db, sessionId);
  const undecided = counts.total - counts.decided - counts.skipped;

  const categories = getCategories(db, sessionId);
  const byCategoryRows = db
    .prepare(
      `SELECT category_id, COUNT(*) AS count FROM decisions
       WHERE session_id = ? AND status = 'decided' GROUP BY category_id`
    )
    .all(sessionId);
  const byCategoryMap = new Map(byCategoryRows.map((row) => [row.category_id, row.count]));
  const byCategory = categories.map((cat) => ({
    categoryId: cat.id,
    name: cat.name,
    isReject: cat.isReject,
    count: byCategoryMap.get(cat.id) || 0,
  }));

  const nowYmd = localYmd(now);
  const decidedRows = db
    .prepare(
      `SELECT decided_at FROM decisions WHERE session_id = ? AND status = 'decided' ORDER BY decided_at ASC`
    )
    .all(sessionId);
  const decidedToday = decidedRows.filter((row) => localYmd(row.decided_at) === nowYmd).length;

  const last20 = decidedRows.slice(-20).map((row) => new Date(row.decided_at).getTime());
  const gaps = [];
  for (let i = 1; i < last20.length; i += 1) {
    const gapSeconds = (last20[i] - last20[i - 1]) / 1000;
    if (gapSeconds <= 600) {
      gaps.push(gapSeconds);
    }
  }
  const med = median(gaps);
  const avgSecondsPerDecision = med == null ? null : Math.round(med * 10) / 10;
  const etaMinutes =
    avgSecondsPerDecision == null
      ? null
      : Math.round((avgSecondsPerDecision * (undecided + counts.skipped)) / 60);

  const items = listIssuesWithDecisions(db, sessionId);
  const breakdown = computeBreakdown(items);

  return {
    counts: { total: counts.total, decided: counts.decided, skipped: counts.skipped, undecided },
    byCategory,
    pace: { decidedToday, avgSecondsPerDecision, etaMinutes },
    breakdown,
  };
}
