import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  openDb,
  createSession,
  getCategories,
  upsertIssues,
  setDecision,
  saveIssueDetail,
  getCachedIssueDetail,
  listIssuesWithDecisions,
  getStats,
} from '../server/db.js';

function makeIssue(key, overrides = {}) {
  return {
    key,
    url: `https://site.atlassian.net/browse/${key}`,
    summary: `Summary ${key}`,
    type: 'Bug',
    status: 'To Do',
    priority: 'High',
    assignee: null,
    reporter: null,
    labels: [],
    components: [],
    created: null,
    updated: null,
    description: '',
    ...overrides,
  };
}

function makeDetail(key, overrides = {}) {
  return {
    key,
    url: `https://site.atlassian.net/browse/${key}`,
    summary: `Summary ${key}`,
    type: 'Bug',
    status: 'To Do',
    statusCategory: 'new',
    priority: 'High',
    resolution: null,
    assignee: null,
    reporter: null,
    creator: null,
    created: null,
    updated: null,
    resolved: null,
    dueDate: null,
    labels: [],
    components: [],
    fixVersions: [],
    affectsVersions: [],
    parent: null,
    subtasks: [],
    links: [],
    descriptionAdf: null,
    environmentAdf: null,
    timeTracking: null,
    attachments: [],
    comments: [],
    commentTotal: 0,
    customFields: [],
    fetchedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('db-v2', () => {
  let db;

  beforeEach(() => {
    db = openDb(':memory:');
  });

  it('issue_details save/get roundtrip; upsert overwrites', () => {
    expect(getCachedIssueDetail(db, 'A-1')).toBeNull();
    const detail = makeDetail('A-1', { summary: 'First' });
    saveIssueDetail(db, detail);
    expect(getCachedIssueDetail(db, 'A-1')).toMatchObject({ key: 'A-1', summary: 'First' });

    const updated = makeDetail('A-1', { summary: 'Second' });
    saveIssueDetail(db, updated);
    expect(getCachedIssueDetail(db, 'A-1')).toMatchObject({ key: 'A-1', summary: 'Second' });
  });

  it('opening an existing file DB created by old schema works', () => {
    const dir = mkdtempSync(join(tmpdir(), 'jira-triage-test-'));
    const file = join(dir, 'triage.db');
    try {
      const fileDb = openDb(file);
      createSession(fileDb, { name: 'S', jql: 'q' });
      fileDb.close();

      const reopened = openDb(file);
      const detail = makeDetail('A-1');
      saveIssueDetail(reopened, detail);
      expect(getCachedIssueDetail(reopened, 'A-1')).toMatchObject({ key: 'A-1' });
      reopened.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('listIssuesWithDecisions: order by position, decision null/decided/skipped mapped', () => {
    const session = createSession(db, { name: 'S', jql: 'q' });
    upsertIssues(db, session.id, [makeIssue('A-1'), makeIssue('A-2'), makeIssue('A-3')]);
    const cats = getCategories(db, session.id);

    setDecision(db, session.id, { issueKey: 'A-1', categoryId: cats[0].id, status: 'decided', note: 'n' });
    setDecision(db, session.id, { issueKey: 'A-2', categoryId: null, status: 'skipped' });

    const items = listIssuesWithDecisions(db, session.id);
    expect(items.map((i) => i.key)).toEqual(['A-1', 'A-2', 'A-3']);
    expect(items[0].decision).toMatchObject({ status: 'decided', categoryId: cats[0].id, note: 'n' });
    expect(items[1].decision).toMatchObject({ status: 'skipped', categoryId: null });
    expect(items[2].decision).toBeNull();
  });

  it('getStats counts/byCategory with zero-count category', () => {
    const session = createSession(db, { name: 'S', jql: 'q' });
    upsertIssues(db, session.id, [makeIssue('A-1'), makeIssue('A-2')]);
    const cats = getCategories(db, session.id);
    setDecision(db, session.id, { issueKey: 'A-1', categoryId: cats[0].id, status: 'decided' });

    const stats = getStats(db, session.id);
    expect(stats.counts).toEqual({ total: 2, decided: 1, skipped: 0, undecided: 1 });
    expect(stats.byCategory).toEqual([
      { categoryId: cats[0].id, name: 'Accept', isReject: false, count: 1 },
      { categoryId: cats[1].id, name: 'Reject', isReject: true, count: 0 },
    ]);
  });

  it('breakdown priority with nulls -> None, sorted; assignee top-10 + Other', () => {
    const session = createSession(db, { name: 'S', jql: 'q' });
    const issues = [];
    for (let i = 0; i < 12; i += 1) {
      issues.push(makeIssue(`A-${i}`, { priority: i < 2 ? null : 'High', assignee: `Person ${i}` }));
    }
    upsertIssues(db, session.id, issues);

    const stats = getStats(db, session.id);
    expect(stats.breakdown.priority[0]).toMatchObject({ value: 'High', total: 10 });
    const noneRow = stats.breakdown.priority.find((r) => r.value === 'None');
    expect(noneRow).toMatchObject({ total: 2 });

    expect(stats.breakdown.assignee).toHaveLength(11); // 10 + Other
    const other = stats.breakdown.assignee.find((r) => r.value === 'Other');
    expect(other).toBeTruthy();
    expect(other.total).toBe(2);
  });

  it('pace: median gaps, decidedToday, eta', () => {
    const session = createSession(db, { name: 'S', jql: 'q' });
    upsertIssues(db, session.id, [
      makeIssue('A-1'),
      makeIssue('A-2'),
      makeIssue('A-3'),
      makeIssue('A-4'),
      makeIssue('A-5'),
      makeIssue('A-6'),
      makeIssue('A-7'),
    ]);
    const cats = getCategories(db, session.id);

    setDecision(db, session.id, { issueKey: 'A-1', categoryId: cats[0].id, status: 'decided' });
    setDecision(db, session.id, { issueKey: 'A-2', categoryId: cats[0].id, status: 'decided' });
    setDecision(db, session.id, { issueKey: 'A-3', categoryId: cats[0].id, status: 'decided' });
    setDecision(db, session.id, { issueKey: 'A-4', categoryId: cats[0].id, status: 'decided' });
    setDecision(db, session.id, { issueKey: 'A-5', categoryId: cats[0].id, status: 'decided' });

    // 5 timestamps -> gaps of 10s, 20s, 30s, 900s (last dropped as > 600s)
    const base = new Date('2026-01-01T00:00:00.000Z').getTime();
    const times = [base, base + 10_000, base + 30_000, base + 60_000, base + 960_000];
    const keys = ['A-1', 'A-2', 'A-3', 'A-4', 'A-5'];
    keys.forEach((key, i) => {
      db.prepare('UPDATE decisions SET decided_at = ? WHERE session_id = ? AND issue_key = ?').run(
        new Date(times[i]).toISOString(),
        session.id,
        key
      );
    });

    const now = new Date(times[3]);
    const stats = getStats(db, session.id, now);
    // gaps: 10, 20, 30, (900 dropped) -> median of [10,20,30] = 20
    expect(stats.pace.avgSecondsPerDecision).toBe(20);
    expect(stats.pace.decidedToday).toBe(5);
    const remaining = stats.counts.undecided + stats.counts.skipped;
    expect(stats.pace.etaMinutes).toBe(Math.round((20 * remaining) / 60));
  });
});
