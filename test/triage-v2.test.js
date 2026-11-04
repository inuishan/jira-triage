import { describe, it, expect, vi } from 'vitest';
import { openDb } from '../server/db.js';
import { createMockJiraClient } from '../server/jira.js';
import { createTriageService, NotFoundError, ValidationError } from '../server/triage.js';

const JQL = 'project = DEMO LIMIT=10';

function makeService() {
  const db = openDb(':memory:');
  const jira = createMockJiraClient();
  const service = createTriageService({ db, jira });
  return { db, jira, service };
}

async function makeSession(service) {
  return service.createSession({ name: 'S', jql: JQL });
}

describe('listIssues', () => {
  it('reflects decide/skip', async () => {
    const { service } = makeService();
    const session = await makeSession(service);
    const categories = session.categories;

    let issues = service.listIssues(session.id);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((i) => i.decision === null)).toBe(true);

    const key = issues[0].key;
    await service.decide(session.id, { issueKey: key, categoryId: categories[0].id, note: 'n' });
    issues = service.listIssues(session.id);
    const decided = issues.find((i) => i.key === key);
    expect(decided.decision).toMatchObject({ status: 'decided', categoryId: categories[0].id, note: 'n' });

    const key2 = issues[1].key;
    service.skip(session.id, { issueKey: key2 });
    issues = service.listIssues(session.id);
    const skipped = issues.find((i) => i.key === key2);
    expect(skipped.decision).toMatchObject({ status: 'skipped', categoryId: null });
  });
});

describe('getIssueDetail', () => {
  it('caches within 10 minutes, refetches on refresh, and 404s for unknown key', async () => {
    const { service, jira } = makeService();
    const session = await makeSession(service);
    const issues = service.listIssues(session.id);
    const key = issues[0].key;

    const spy = vi.spyOn(jira, 'getIssueDetail');

    const first = await service.getIssueDetail(session.id, key);
    expect(first.key).toBe(key);
    expect(spy).toHaveBeenCalledTimes(1);

    const second = await service.getIssueDetail(session.id, key);
    expect(second.key).toBe(key);
    expect(spy).toHaveBeenCalledTimes(1);

    const third = await service.getIssueDetail(session.id, key, { refresh: true });
    expect(third.key).toBe(key);
    expect(spy).toHaveBeenCalledTimes(2);

    await expect(service.getIssueDetail(session.id, 'DEMO-999')).rejects.toBeInstanceOf(
      NotFoundError
    );
  });

  it('falls back to stale cache when Jira fails, and rejects when no cache exists', async () => {
    const { service, jira, db } = makeService();
    const session = await makeSession(service);
    const issues = service.listIssues(session.id);
    const key = issues[0].key;

    const detail = await service.getIssueDetail(session.id, key);
    // force the cache to look old (both the column and the stored JSON's fetchedAt)
    const old = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const staleData = JSON.stringify({ ...detail, fetchedAt: old });
    db.prepare('UPDATE issue_details SET fetched_at = ?, data = ? WHERE issue_key = ?').run(
      old,
      staleData,
      key
    );

    vi.spyOn(jira, 'getIssueDetail').mockRejectedValueOnce(new Error('Jira 500: boom'));
    const stale = await service.getIssueDetail(session.id, key);
    expect(stale.stale).toBe(true);
    expect(stale.key).toBe(detail.key);

    const key2 = issues[1].key;
    vi.spyOn(jira, 'getIssueDetail').mockRejectedValueOnce(new Error('Jira 500: boom'));
    await expect(service.getIssueDetail(session.id, key2)).rejects.toThrow('boom');
  });
});

describe('getStats', () => {
  it('has sane shape after a few decisions', async () => {
    const { service } = makeService();
    const session = await makeSession(service);
    const categories = session.categories;
    const issues = service.listIssues(session.id);

    await service.decide(session.id, { issueKey: issues[0].key, categoryId: categories[0].id });
    await service.decide(session.id, { issueKey: issues[1].key, categoryId: categories[1].id });
    service.skip(session.id, { issueKey: issues[2].key });

    const stats = service.getStats(session.id);
    expect(stats.counts.total).toBe(issues.length);
    expect(stats.counts.decided).toBe(2);
    expect(stats.counts.skipped).toBe(1);
    expect(stats.counts.undecided).toBe(issues.length - 3);
    expect(Array.isArray(stats.byCategory)).toBe(true);
    expect(stats.byCategory.length).toBe(categories.length);
    expect(stats.pace).toHaveProperty('decidedToday');
    expect(stats.pace).toHaveProperty('avgSecondsPerDecision');
    expect(stats.pace).toHaveProperty('etaMinutes');
    expect(stats.breakdown).toHaveProperty('priority');
    expect(stats.breakdown).toHaveProperty('type');
    expect(stats.breakdown).toHaveProperty('status');
    expect(stats.breakdown).toHaveProperty('assignee');
  });
});

describe('getAttachment', () => {
  it('rejects invalid ids', async () => {
    const { service } = makeService();
    await expect(service.getAttachment('not-an-id')).rejects.toBeInstanceOf(ValidationError);
  });

  it('returns the mock png for a valid id', async () => {
    const { service } = makeService();
    const result = await service.getAttachment('10001');
    expect(result.contentType).toBe('image/png');
  });
});
