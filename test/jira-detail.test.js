import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  customFieldToDisplay,
  normalizeIssueDetail,
  createJiraClient,
  createMockJiraClient,
} from '../server/jira.js';

const BASE_URL = 'https://example.atlassian.net';

function loadFixture() {
  const raw = readFileSync(new URL('./fixtures/issue-detail.json', import.meta.url));
  return JSON.parse(raw);
}

describe('customFieldToDisplay', () => {
  it('returns null for null/undefined/empty string/empty array', () => {
    expect(customFieldToDisplay(null)).toBeNull();
    expect(customFieldToDisplay(undefined)).toBeNull();
    expect(customFieldToDisplay('')).toBeNull();
    expect(customFieldToDisplay([])).toBeNull();
  });

  it('stringifies numbers and booleans', () => {
    expect(customFieldToDisplay(5)).toBe('5');
    expect(customFieldToDisplay(true)).toBe('true');
  });

  it('joins a sprint array with name + lowercased state', () => {
    const value = customFieldToDisplay([
      { id: 1, name: 'Platform Sprint 12', state: 'active' },
      { id: 2, name: 'Platform Sprint 13', state: 'future' },
    ]);
    expect(value).toBe('Platform Sprint 12 (active), Platform Sprint 13 (future)');
  });

  it('formats a select-with-child value as "value / child"', () => {
    expect(customFieldToDisplay({ value: 'Web', child: { value: 'Dashboard' } })).toBe('Web / Dashboard');
  });

  it('joins a multi-user array by displayName', () => {
    const value = customFieldToDisplay([
      { displayName: 'Yuki Tanaka', accountId: 'acc-yuki' },
      { displayName: 'Ben Carter', accountId: 'acc-ben' },
    ]);
    expect(value).toBe('Yuki Tanaka, Ben Carter');
  });

  it('wraps an ADF doc as { adf }', () => {
    const adf = { type: 'doc', version: 1, content: [] };
    expect(customFieldToDisplay(adf)).toEqual({ adf });
  });
});

describe('normalizeIssueDetail', () => {
  const fixture = loadFixture();
  const detail = normalizeIssueDetail(fixture, BASE_URL);

  it('maps links with correct direction and label', () => {
    expect(detail.links).toHaveLength(3);
    const outward = detail.links.find((l) => l.issue.key === 'DEMO-110');
    expect(outward.label).toBe('blocks');
    const inward = detail.links.find((l) => l.issue.key === 'DEMO-111');
    expect(inward.label).toBe('is blocked by');
    const relates = detail.links.find((l) => l.issue.key === 'DEMO-112');
    expect(relates.label).toBe('relates to');
  });

  it('maps subtasks and parent', () => {
    expect(detail.parent).toMatchObject({ key: 'DEMO-100', type: 'Epic', statusCategory: 'indeterminate' });
    expect(detail.subtasks).toHaveLength(2);
    expect(detail.subtasks[0]).toMatchObject({ key: 'DEMO-101-1', statusCategory: 'new' });
    expect(detail.subtasks[1]).toMatchObject({ key: 'DEMO-101-2', statusCategory: 'done' });
  });

  it('builds attachment proxy URLs, thumbnail only for images', () => {
    expect(detail.attachments).toHaveLength(2);
    const png = detail.attachments.find((a) => a.id === '10001');
    expect(png.contentUrl).toBe('/api/attachments/10001');
    expect(png.thumbnailUrl).toBe('/api/attachments/10001/thumbnail');
    const txt = detail.attachments.find((a) => a.id === '10002');
    expect(txt.contentUrl).toBe('/api/attachments/10002');
    expect(txt.thumbnailUrl).toBeNull();
  });

  it('orders comments ascending by created', () => {
    expect(detail.comments.map((c) => c.id)).toEqual(['30001', '30002', '30003']);
    expect(detail.commentTotal).toBe(3);
  });

  it('sorts customFields by name, skipping Rank/Development/empty', () => {
    const names = detail.customFields.map((f) => f.name);
    expect(names).not.toContain('Rank');
    expect(names).not.toContain('Development');
    expect(names).not.toContain('Business Value');
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));

    const sprint = detail.customFields.find((f) => f.name === 'Sprint');
    expect(sprint.value).toBe('Platform Sprint 12 (active), Platform Sprint 13 (future)');

    const cascading = detail.customFields.find((f) => f.name === 'Cascading Select');
    expect(cascading.value).toBe('Web / Dashboard');
  });

  it('wraps a plain string environment as ADF', () => {
    expect(detail.environmentAdf).toEqual({
      type: 'doc',
      version: 1,
      content: [{ type: 'paragraph', content: [{ type: 'text', text: fixture.fields.environment }] }],
    });
  });

  it('keeps the description ADF doc as-is', () => {
    expect(detail.descriptionAdf).toEqual(fixture.fields.description);
  });
});

describe('createJiraClient.getIssueDetail', () => {
  it('fetches detail fields with expand=names, pages comments, sends auth header', async () => {
    const fixture = loadFixture();
    const firstPageFixture = structuredClone(fixture);
    firstPageFixture.fields.comment.total = 150;
    firstPageFixture.fields.comment.comments = fixture.fields.comment.comments.slice(0, 1);

    const commentPage2 = Array.from({ length: 100 }, (_, i) => ({
      id: `page2-${i}`,
      author: { displayName: 'Someone', accountId: 'acc-x' },
      created: `2026-02-01T00:00:${String(i).padStart(2, '0')}.000+0000`,
      updated: `2026-02-01T00:00:${String(i).padStart(2, '0')}.000+0000`,
      body: { type: 'doc', version: 1, content: [] },
    }));
    const commentPage3 = Array.from({ length: 49 }, (_, i) => ({
      id: `page3-${i}`,
      author: { displayName: 'Someone', accountId: 'acc-x' },
      created: `2026-02-02T00:00:${String(i).padStart(2, '0')}.000+0000`,
      updated: `2026-02-02T00:00:${String(i).padStart(2, '0')}.000+0000`,
      body: { type: 'doc', version: 1, content: [] },
    }));

    const calls = [];
    const fetchImpl = async (url, opts) => {
      calls.push({ url, opts });
      if (calls.length === 1) {
        return { ok: true, status: 200, json: async () => firstPageFixture };
      }
      if (calls.length === 2) {
        return { ok: true, status: 200, json: async () => ({ comments: commentPage2 }) };
      }
      return { ok: true, status: 200, json: async () => ({ comments: commentPage3 }) };
    };

    const client = createJiraClient({ baseUrl: BASE_URL, email: 'me@example.com', apiToken: 'tok', fetchImpl });
    const detail = await client.getIssueDetail('DEMO-101');

    expect(calls[0].url).toBe(`${BASE_URL}/rest/api/3/issue/DEMO-101?fields=*all&expand=names`);
    expect(calls[0].opts.headers.Authorization).toMatch(/^Basic /);
    expect(calls[1].url).toContain('startAt=1');
    expect(calls[2].url).toContain('startAt=101');

    expect(detail.commentTotal).toBe(150);
    expect(detail.comments).toHaveLength(150);
  });

  it('throws a mapped error on non-2xx', async () => {
    const fetchImpl = async () => ({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({ errorMessages: ['Issue does not exist'] }),
    });
    const client = createJiraClient({ baseUrl: BASE_URL, email: 'me@example.com', apiToken: 'tok', fetchImpl });
    await expect(client.getIssueDetail('NOPE-1')).rejects.toThrow('Jira 404: Issue does not exist');
  });
});

describe('createJiraClient.getAttachment', () => {
  it('requests content with redirect=false and overridden Accept header', async () => {
    let captured;
    const fetchImpl = async (url, opts) => {
      captured = { url, opts };
      return { ok: true, status: 200, headers: new Map([['content-type', 'image/png'], ['content-length', '2048']]), body: Buffer.from('x') };
    };
    const client = createJiraClient({ baseUrl: BASE_URL, email: 'me@example.com', apiToken: 'tok', fetchImpl });
    const result = await client.getAttachment('10001');
    expect(captured.url).toBe(`${BASE_URL}/rest/api/3/attachment/content/10001?redirect=false`);
    expect(captured.opts.headers.Accept).toBe('*/*');
    expect(result.contentType).toBe('image/png');
    expect(result.contentLength).toBe(2048);
  });

  it('requests thumbnail with the thumbnail path when thumbnail: true', async () => {
    let captured;
    const fetchImpl = async (url, opts) => {
      captured = { url, opts };
      return { ok: true, status: 200, headers: new Map([['content-type', 'image/png']]), body: Buffer.from('x') };
    };
    const client = createJiraClient({ baseUrl: BASE_URL, email: 'me@example.com', apiToken: 'tok', fetchImpl });
    await client.getAttachment('10001', { thumbnail: true });
    expect(captured.url).toBe(`${BASE_URL}/rest/api/3/attachment/thumbnail/10001?redirect=false&fallbackToDefault=false`);
  });

  it('throws on a 404', async () => {
    const fetchImpl = async () => ({ ok: false, status: 404, statusText: 'Not Found', json: async () => ({}) });
    const client = createJiraClient({ baseUrl: BASE_URL, email: 'me@example.com', apiToken: 'tok', fetchImpl });
    let caught;
    try {
      await client.getAttachment('99999');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught.status).toBe(404);
  });
});

describe('createMockJiraClient getIssueDetail/getAttachment', () => {
  it('overlays the matching fixture issue summary onto the detail template', async () => {
    const client = createMockJiraClient({});
    const detail = await client.getIssueDetail('DEMO-105');
    expect(detail.key).toBe('DEMO-105');
    expect(detail.summary).toBe('Add bulk revoke for terminated employee badges');
    // template-only data (comments) still present
    expect(detail.comments.length).toBeGreaterThan(0);
    expect(detail.comments[0].id).toBe('30001');
  });

  it('throws 404 for an unknown key', async () => {
    const client = createMockJiraClient({});
    await expect(client.getIssueDetail('NOPE-999')).rejects.toMatchObject({ status: 404 });
  });

  it('returns a PNG buffer for a known attachment id', async () => {
    const client = createMockJiraClient({});
    const result = await client.getAttachment('10001');
    expect(result.contentType).toBe('image/png');
    expect(Buffer.isBuffer(result.body)).toBe(true);
  });

  it('throws 404 for an unknown attachment id', async () => {
    const client = createMockJiraClient({});
    await expect(client.getAttachment('99999')).rejects.toMatchObject({ status: 404 });
  });
});
