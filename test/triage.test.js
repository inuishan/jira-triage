import { describe, it, expect, beforeEach } from 'vitest';
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

describe('createSession validation', () => {
  it('rejects empty name', async () => {
    const { service } = makeService();
    await expect(service.createSession({ name: '  ', jql: JQL })).rejects.toBeInstanceOf(
      ValidationError
    );
  });

  it('rejects empty jql', async () => {
    const { service } = makeService();
    await expect(service.createSession({ name: 'S', jql: '  ' })).rejects.toBeInstanceOf(
      ValidationError
    );
  });

  it('rejects duplicate hotkeys', async () => {
    const { service } = makeService();
    await expect(
      service.createSession({
        name: 'S',
        jql: JQL,
        categories: [
          { name: 'A', hotkey: 'a' },
          { name: 'B', hotkey: 'a' },
        ],
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects reserved hotkeys', async () => {
    const { service } = makeService();
    await expect(
      service.createSession({
        name: 'S',
        jql: JQL,
        categories: [{ name: 'A', hotkey: 's' }],
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects more than one isReject category', async () => {
    const { service } = makeService();
    await expect(
      service.createSession({
        name: 'S',
        jql: JQL,
        categories: [
          { name: 'A', hotkey: 'a', isReject: true },
          { name: 'B', hotkey: 'b', isReject: true },
        ],
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('createSession issue loading', () => {
  it('loads issues from jira.search', async () => {
    const { service } = makeService();
    const session = await service.createSession({ name: 'S', jql: JQL });
    expect(session.counts.total).toBe(10);
    const queue = service.getQueue(session.id);
    expect(queue.length).toBe(10);
  });

  it('deletes the session if search fails', async () => {
    const db = (await import('../server/db.js')).openDb(':memory:');
    const jira = {
      search: async () => {
        throw new Error('network down');
      },
    };
    const service = createTriageService({ db, jira });
    await expect(service.createSession({ name: 'S', jql: JQL })).rejects.toThrow('network down');
    expect(service.listSessions()).toEqual([]);
  });
});

describe('decide / skip', () => {
  let service;
  let session;

  beforeEach(async () => {
    ({ service } = makeService());
    session = await service.createSession({ name: 'S', jql: JQL });
  });

  it('decide without syncLabels makes no jira calls and shrinks queue', async () => {
    const { service: svc, jira } = makeService();
    const sess = await svc.createSession({ name: 'S', jql: JQL });
    const category = svc.getSession(sess.id).categories[0];
    const key = svc.getQueue(sess.id)[0].key;
    const before = jira.calls.length;
    const result = await svc.decide(sess.id, { issueKey: key, categoryId: category.id });
    expect(jira.calls.length).toBe(before);
    expect(result.warning).toBeUndefined();
    expect(svc.getQueue(sess.id).find((i) => i.key === key)).toBeUndefined();
    expect(svc.getSession(sess.id).counts.decided).toBe(1);
  });

  it('decide with syncLabels + jiraLabel calls addLabel and sets labelSynced', async () => {
    const { service: svc, jira } = makeService();
    const sess = await svc.createSession({
      name: 'S',
      jql: JQL,
      categories: [{ name: 'Accept', hotkey: 'a', jiraLabel: 'q4-pick' }],
    });
    svc.setSyncLabels(sess.id, true);
    const category = svc.getSession(sess.id).categories[0];
    const key = svc.getQueue(sess.id)[0].key;
    const result = await svc.decide(sess.id, { issueKey: key, categoryId: category.id });
    expect(jira.calls).toContainEqual({ op: 'add', key, label: 'q4-pick' });
    expect(result.decision.labelSynced).toBe(true);
  });

  it('addLabel failure keeps decision, warns, and syncLabels retries successfully', async () => {
    const db = (await import('../server/db.js')).openDb(':memory:');
    let shouldFail = true;
    const realJira = createMockJiraClient();
    const jira = {
      ...realJira,
      addLabel: async (key, label) => {
        if (shouldFail) throw new Error('rate limited');
        return realJira.addLabel(key, label);
      },
    };
    const svc = createTriageService({ db, jira });
    const sess = await svc.createSession({
      name: 'S',
      jql: JQL,
      categories: [{ name: 'Accept', hotkey: 'a', jiraLabel: 'q4-pick' }],
    });
    svc.setSyncLabels(sess.id, true);
    const category = svc.getSession(sess.id).categories[0];
    const key = svc.getQueue(sess.id)[0].key;
    const result = await svc.decide(sess.id, { issueKey: key, categoryId: category.id });
    expect(result.warning).toMatch(/Jira label failed/);
    expect(result.decision.labelSynced).toBe(false);

    shouldFail = false;
    const syncResult = await svc.syncLabels(sess.id);
    expect(syncResult.synced).toBe(1);
    expect(syncResult.failed).toEqual([]);
    expect(svc.getSession(sess.id).counts.decided).toBe(1);
  });

  it('skip then decide: skip moves to end, deciding removes from queue', async () => {
    const queueBefore = service.getQueue(session.id);
    const firstKey = queueBefore[0].key;
    await service.skip(session.id, { issueKey: firstKey });
    const queueAfterSkip = service.getQueue(session.id);
    expect(queueAfterSkip[queueAfterSkip.length - 1].key).toBe(firstKey);
    expect(queueAfterSkip.length).toBe(queueBefore.length);

    const category = service.getSession(session.id).categories[0];
    await service.decide(session.id, { issueKey: firstKey, categoryId: category.id });
    const queueAfterDecide = service.getQueue(session.id);
    expect(queueAfterDecide.find((i) => i.key === firstKey)).toBeUndefined();
  });

  it('decide on unknown issue throws NotFoundError', async () => {
    const category = service.getSession(session.id).categories[0];
    await expect(
      service.decide(session.id, { issueKey: 'NOPE-1', categoryId: category.id })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('decide with unknown category throws ValidationError', async () => {
    const key = service.getQueue(session.id)[0].key;
    await expect(
      service.decide(session.id, { issueKey: key, categoryId: 9999 })
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('undo / reopen', () => {
  it('undo removes the last decision and the label if synced', async () => {
    const { service: svc, jira } = makeService();
    const sess = await svc.createSession({
      name: 'S',
      jql: JQL,
      categories: [{ name: 'Accept', hotkey: 'a', jiraLabel: 'q4-pick' }],
    });
    svc.setSyncLabels(sess.id, true);
    const category = svc.getSession(sess.id).categories[0];
    const key = svc.getQueue(sess.id)[0].key;
    await svc.decide(sess.id, { issueKey: key, categoryId: category.id });
    expect(jira.calls).toContainEqual({ op: 'add', key, label: 'q4-pick' });

    const result = await svc.undo(sess.id);
    expect(result.issueKey).toBe(key);
    expect(jira.calls).toContainEqual({ op: 'remove', key, label: 'q4-pick' });
    expect(svc.getQueue(sess.id).find((i) => i.key === key)).toBeDefined();
  });

  it('undo with nothing to undo returns issueKey null', async () => {
    const { service } = makeService();
    const session = await service.createSession({ name: 'S', jql: JQL });
    const result = await service.undo(session.id);
    expect(result.issueKey).toBeNull();
  });

  it('reopen a specific key removes its decision', async () => {
    const { service } = makeService();
    const session = await service.createSession({ name: 'S', jql: JQL });
    const category = service.getSession(session.id).categories[0];
    const key = service.getQueue(session.id)[0].key;
    await service.decide(session.id, { issueKey: key, categoryId: category.id });
    const result = await service.reopen(session.id, key);
    expect(result.issueKey).toBe(key);
    expect(service.getQueue(session.id).find((i) => i.key === key)).toBeDefined();
  });

  it('reopen unknown key throws NotFoundError', async () => {
    const { service } = makeService();
    const session = await service.createSession({ name: 'S', jql: JQL });
    await expect(service.reopen(session.id, 'NOPE-1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('changing decision via reopen+decide from one labelled category to another ends with only the new label', async () => {
    const { service: svc, jira } = makeService();
    const sess = await svc.createSession({
      name: 'S',
      jql: JQL,
      categories: [
        { name: 'Accept', hotkey: 'a', jiraLabel: 'q4-pick' },
        { name: 'Later', hotkey: 'l', jiraLabel: 'q4-later' },
      ],
    });
    svc.setSyncLabels(sess.id, true);
    const [catA, catB] = svc.getSession(sess.id).categories;
    const key = svc.getQueue(sess.id)[0].key;
    await svc.decide(sess.id, { issueKey: key, categoryId: catA.id });
    await svc.reopen(sess.id, key);
    await svc.decide(sess.id, { issueKey: key, categoryId: catB.id });

    expect(jira.calls).toContainEqual({ op: 'add', key, label: 'q4-pick' });
    expect(jira.calls).toContainEqual({ op: 'remove', key, label: 'q4-pick' });
    expect(jira.calls).toContainEqual({ op: 'add', key, label: 'q4-later' });
  });
});

describe('getResults / resultsCsv', () => {
  it('groups decisions by category position and builds jql, lists skipped issues', async () => {
    const { service } = makeService();
    const session = await service.createSession({
      name: 'S',
      jql: JQL,
      categories: [
        { name: 'Accept', hotkey: 'a' },
        { name: 'Reject', hotkey: 'r', isReject: true },
      ],
    });
    const queue = service.getQueue(session.id);
    const categories = service.getSession(session.id).categories;
    await service.decide(session.id, { issueKey: queue[0].key, categoryId: categories[0].id });
    await service.decide(session.id, { issueKey: queue[1].key, categoryId: categories[1].id });
    await service.skip(session.id, { issueKey: queue[2].key });

    const results = service.getResults(session.id);
    expect(results.groups[0].category.name).toBe('Accept');
    expect(results.groups[0].items.map((i) => i.issue.key)).toEqual([queue[0].key]);
    expect(results.groups[0].jql).toBe(`key in (${queue[0].key})`);
    expect(results.groups[1].items.map((i) => i.issue.key)).toEqual([queue[1].key]);
    expect(results.skipped.map((i) => i.key)).toEqual([queue[2].key]);
  });

  it('resultsCsv quotes fields and guards against formula injection', async () => {
    const db = (await import('../server/db.js')).openDb(':memory:');
    const issues = [
      {
        key: 'DEMO-1',
        fields: {
          summary: '=HYPERLINK("x")',
          issuetype: { name: 'Bug' },
          status: { name: 'To Do' },
          priority: { name: 'High' },
          assignee: { displayName: 'A, "B"' },
          reporter: null,
          labels: [],
          components: [],
          created: null,
          updated: null,
          description: null,
        },
      },
      {
        key: 'DEMO-2',
        fields: {
          summary: 'Plain summary',
          issuetype: { name: 'Bug' },
          status: { name: 'To Do' },
          priority: { name: 'Low' },
          assignee: null,
          reporter: null,
          labels: [],
          components: [],
          created: null,
          updated: null,
          description: null,
        },
      },
    ];
    const jira = createMockJiraClient({ issues });
    const service = createTriageService({ db, jira });
    const session = await service.createSession({ name: 'S', jql: JQL });
    const queue = service.getQueue(session.id);
    const categories = service.getSession(session.id).categories;
    await service.decide(session.id, {
      issueKey: 'DEMO-1',
      categoryId: categories[0].id,
      note: 'has, comma',
    });
    await service.decide(session.id, { issueKey: 'DEMO-2', categoryId: categories[0].id });

    const csv = service.resultsCsv(session.id);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('key,summary,category,status,priority,assignee,note,decided_at,url');
    expect(lines[1]).toContain('"\'=HYPERLINK(""x"")"');
    expect(lines[1]).toContain('"A, ""B"""');
    expect(lines[1]).toContain('"has, comma"');
    expect(csv.endsWith('\n')).toBe(true);
    void queue;
  });
});
