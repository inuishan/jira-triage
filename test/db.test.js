import { describe, it, expect, beforeEach } from 'vitest';
import {
  openDb,
  createSession,
  getSession,
  listSessions,
  setSyncLabels,
  deleteSession,
  getCategories,
  upsertIssues,
  getIssue,
  getQueue,
  setDecision,
  getDecision,
  getLastDecision,
  deleteDecision,
  markLabelSynced,
  listDecisions,
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

describe('db', () => {
  let db;

  beforeEach(() => {
    db = openDb(':memory:');
  });

  it('createSession with no categories gets 2 default categories', () => {
    const session = createSession(db, { name: 'Q4 pick', jql: 'project = ABC' });
    const cats = getCategories(db, session.id);
    expect(cats).toHaveLength(2);
    expect(cats[0]).toMatchObject({ name: 'Accept', position: 0, isReject: false });
    expect(cats[1]).toMatchObject({ name: 'Reject', position: 1, isReject: true });
  });

  it('createSession with custom categories preserves order, hotkeys, jiraLabel', () => {
    const session = createSession(db, {
      name: 'Custom',
      jql: 'project = X',
      categories: [
        { name: 'Yes', jiraLabel: 'yes-label', hotkey: 'y', isReject: false },
        { name: 'No', jiraLabel: '', hotkey: 'n', isReject: true },
      ],
    });
    const cats = getCategories(db, session.id);
    expect(cats).toHaveLength(2);
    expect(cats[0]).toMatchObject({ name: 'Yes', jiraLabel: 'yes-label', hotkey: 'y', position: 0, isReject: false });
    expect(cats[1]).toMatchObject({ name: 'No', jiraLabel: null, hotkey: 'n', position: 1, isReject: true });
  });

  it('upsertIssues returns {added, updated} correctly and updates data/position', () => {
    const session = createSession(db, { name: 'S', jql: 'q' });
    const r1 = upsertIssues(db, session.id, [makeIssue('A-1'), makeIssue('A-2')]);
    expect(r1).toEqual({ added: 2, updated: 0 });

    const r2 = upsertIssues(db, session.id, [
      makeIssue('A-2', { summary: 'Updated' }),
      makeIssue('A-3'),
    ]);
    expect(r2).toEqual({ added: 1, updated: 1 });

    const issue2 = getIssue(db, session.id, 'A-2');
    expect(issue2.summary).toBe('Updated');
  });

  it('getQueue orders undecided first, excludes decided, moves skipped to end by seq', () => {
    const session = createSession(db, { name: 'S', jql: 'q' });
    upsertIssues(db, session.id, [makeIssue('A-1'), makeIssue('A-2'), makeIssue('A-3')]);
    const cats = getCategories(db, session.id);

    setDecision(db, session.id, { issueKey: 'A-1', categoryId: cats[0].id, status: 'decided' });
    setDecision(db, session.id, { issueKey: 'A-2', categoryId: null, status: 'skipped' });

    const queue = getQueue(db, session.id);
    expect(queue.map((i) => i.key)).toEqual(['A-3', 'A-2']);
  });

  it('setDecision twice on same key results in a single row with larger seq and reset labelSynced', () => {
    const session = createSession(db, { name: 'S', jql: 'q' });
    upsertIssues(db, session.id, [makeIssue('A-1')]);
    const cats = getCategories(db, session.id);

    const d1 = setDecision(db, session.id, { issueKey: 'A-1', categoryId: cats[0].id, status: 'decided' });
    markLabelSynced(db, session.id, 'A-1', true);
    const d2 = setDecision(db, session.id, { issueKey: 'A-1', categoryId: cats[1].id, status: 'decided' });

    expect(d2.seq).toBeGreaterThan(d1.seq);
    expect(d2.labelSynced).toBe(false);

    const all = listDecisions(db, session.id);
    expect(all.filter((d) => d.issueKey === 'A-1')).toHaveLength(1);
  });

  it('getLastDecision returns highest seq; deleteDecision removes it; then returns previous', () => {
    const session = createSession(db, { name: 'S', jql: 'q' });
    upsertIssues(db, session.id, [makeIssue('A-1'), makeIssue('A-2')]);
    const cats = getCategories(db, session.id);

    setDecision(db, session.id, { issueKey: 'A-1', categoryId: cats[0].id, status: 'decided' });
    const d2 = setDecision(db, session.id, { issueKey: 'A-2', categoryId: cats[0].id, status: 'decided' });

    expect(getLastDecision(db, session.id).issueKey).toBe('A-2');
    expect(getLastDecision(db, session.id).seq).toBe(d2.seq);

    deleteDecision(db, session.id, 'A-2');
    expect(getLastDecision(db, session.id).issueKey).toBe('A-1');
  });

  it('counts: total/decided/skipped/remaining are correct', () => {
    const session = createSession(db, { name: 'S', jql: 'q' });
    upsertIssues(db, session.id, [makeIssue('A-1'), makeIssue('A-2'), makeIssue('A-3')]);
    const cats = getCategories(db, session.id);

    setDecision(db, session.id, { issueKey: 'A-1', categoryId: cats[0].id, status: 'decided' });
    setDecision(db, session.id, { issueKey: 'A-2', categoryId: null, status: 'skipped' });

    const updated = getSession(db, session.id);
    expect(updated.counts).toEqual({ total: 3, decided: 1, skipped: 1, remaining: 2 });
  });

  it('listSessions returns newest first; deleteSession cascades', () => {
    const s1 = createSession(db, { name: 'First', jql: 'q1' });
    const s2 = createSession(db, { name: 'Second', jql: 'q2' });
    upsertIssues(db, s2.id, [makeIssue('B-1')]);

    const sessions = listSessions(db);
    expect(sessions.map((s) => s.id)).toEqual([s2.id, s1.id]);

    deleteSession(db, s2.id);
    expect(getCategories(db, s2.id)).toEqual([]);
    expect(getQueue(db, s2.id)).toEqual([]);
    expect(getSession(db, s2.id)).toBeNull();
  });

  it('markLabelSynced flips the flag', () => {
    const session = createSession(db, { name: 'S', jql: 'q' });
    upsertIssues(db, session.id, [makeIssue('A-1')]);
    const cats = getCategories(db, session.id);
    setDecision(db, session.id, { issueKey: 'A-1', categoryId: cats[0].id, status: 'decided' });

    expect(getDecision(db, session.id, 'A-1').labelSynced).toBe(false);
    markLabelSynced(db, session.id, 'A-1', true);
    expect(getDecision(db, session.id, 'A-1').labelSynced).toBe(true);
    markLabelSynced(db, session.id, 'A-1', false);
    expect(getDecision(db, session.id, 'A-1').labelSynced).toBe(false);
  });

  it('setSyncLabels updates the session flag', () => {
    const session = createSession(db, { name: 'S', jql: 'q' });
    expect(session.syncLabels).toBe(false);
    const updated = setSyncLabels(db, session.id, true);
    expect(updated.syncLabels).toBe(true);
  });
});
