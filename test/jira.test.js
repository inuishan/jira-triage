import { describe, it, expect } from 'vitest';
import {
  adfToText,
  normalizeIssue,
  createJiraClient,
  createMockJiraClient,
  createJiraFromEnv,
  SEARCH_FIELDS,
} from '../server/jira.js';

const BASE_URL = 'https://example.atlassian.net';

describe('adfToText', () => {
  it('returns empty string for null/undefined', () => {
    expect(adfToText(null)).toBe('');
    expect(adfToText(undefined)).toBe('');
  });

  it('returns the string itself when given a string', () => {
    expect(adfToText('plain text')).toBe('plain text');
  });

  it('converts paragraphs to text separated by newlines', () => {
    const adf = {
      type: 'doc',
      version: 1,
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'First.' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Second.' }] },
      ],
    };
    expect(adfToText(adf)).toBe('First.\nSecond.');
  });

  it('converts a bullet list with "- " prefixes', () => {
    const adf = {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'One' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Two' }] }] },
          ],
        },
      ],
    };
    expect(adfToText(adf)).toBe('- One\n- Two');
  });

  it('handles hardBreak within a paragraph', () => {
    const adf = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Line1' }, { type: 'hardBreak' }, { type: 'text', text: 'Line2' }],
        },
      ],
    };
    expect(adfToText(adf)).toBe('Line1\nLine2');
  });

  it('handles mention and emoji nodes', () => {
    const adf = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'mention', attrs: { text: '@jane' } },
            { type: 'text', text: ' is on it ' },
            { type: 'emoji', attrs: { shortName: ':+1:' } },
          ],
        },
      ],
    };
    expect(adfToText(adf)).toBe('@jane is on it :+1:');
  });

  it('collapses 3+ newlines to 2 and trims', () => {
    const adf = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'A' }] },
        { type: 'rule' },
        { type: 'rule' },
        { type: 'paragraph', content: [{ type: 'text', text: 'B' }] },
      ],
    };
    const result = adfToText(adf);
    expect(result).not.toMatch(/\n{3,}/);
    expect(result.startsWith('A')).toBe(true);
    expect(result.endsWith('B')).toBe(true);
  });
});

describe('normalizeIssue', () => {
  it('maps a fully populated raw issue', () => {
    const raw = {
      key: 'ABC-123',
      fields: {
        summary: 'Something broke',
        issuetype: { name: 'Bug' },
        status: { name: 'To Do' },
        priority: { name: 'High' },
        assignee: { displayName: 'Jane Doe' },
        reporter: { displayName: 'John Roe' },
        labels: ['a', 'b'],
        components: [{ name: 'API' }],
        created: '2026-01-02T03:04:05.000+0000',
        updated: '2026-01-03T03:04:05.000+0000',
        description: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Details.' }] }] },
      },
    };
    expect(normalizeIssue(raw, BASE_URL)).toEqual({
      key: 'ABC-123',
      url: `${BASE_URL}/browse/ABC-123`,
      summary: 'Something broke',
      type: 'Bug',
      status: 'To Do',
      priority: 'High',
      assignee: 'Jane Doe',
      reporter: 'John Roe',
      labels: ['a', 'b'],
      components: ['API'],
      created: '2026-01-02T03:04:05.000+0000',
      updated: '2026-01-03T03:04:05.000+0000',
      description: 'Details.',
    });
  });

  it('defaults missing nested fields to null/[]/empty string', () => {
    const raw = { key: 'ABC-124', fields: { summary: 'Sparse issue' } };
    const normalized = normalizeIssue(raw, BASE_URL);
    expect(normalized.type).toBeNull();
    expect(normalized.status).toBeNull();
    expect(normalized.priority).toBeNull();
    expect(normalized.assignee).toBeNull();
    expect(normalized.reporter).toBeNull();
    expect(normalized.labels).toEqual([]);
    expect(normalized.components).toEqual([]);
    expect(normalized.created).toBeNull();
    expect(normalized.updated).toBeNull();
    expect(normalized.description).toBe('');
  });
});

function makeIssue(key) {
  return { key, fields: { summary: `Summary for ${key}` } };
}

describe('createJiraClient.search pagination', () => {
  it('follows nextPageToken until isLast, combining pages in order', async () => {
    const calls = [];
    const pages = [
      { issues: [makeIssue('P-1'), makeIssue('P-2')], nextPageToken: 'p2', isLast: false },
      { issues: [makeIssue('P-3')], nextPageToken: 'p3', isLast: false },
      { issues: [makeIssue('P-4')], isLast: true },
    ];

    const fetchImpl = async (url, opts) => {
      calls.push({ url, opts });
      const body = JSON.parse(opts.body);
      const page = pages[calls.length - 1];
      return {
        ok: true,
        status: 200,
        json: async () => page,
        _sentBody: body,
      };
    };

    const client = createJiraClient({ baseUrl: BASE_URL, email: 'me@example.com', apiToken: 'secret-token', fetchImpl });
    const result = await client.search('project = DEMO');

    expect(calls).toHaveLength(3);
    expect(result.map((i) => i.key)).toEqual(['P-1', 'P-2', 'P-3', 'P-4']);

    const firstBody = JSON.parse(calls[0].opts.body);
    expect(firstBody.jql).toBe('project = DEMO');
    expect(firstBody.fields).toEqual(SEARCH_FIELDS);
    expect(firstBody.nextPageToken).toBeUndefined();

    const secondBody = JSON.parse(calls[1].opts.body);
    expect(secondBody.nextPageToken).toBe('p2');
    const thirdBody = JSON.parse(calls[2].opts.body);
    expect(thirdBody.nextPageToken).toBe('p3');

    expect(calls[0].opts.headers.Authorization).toMatch(/^Basic /);
  });
});

describe('createJiraClient error mapping', () => {
  it('maps a 400 error response to a descriptive Error with .status', async () => {
    const fetchImpl = async () => ({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => ({ errorMessages: ['Bad JQL'] }),
    });

    const client = createJiraClient({ baseUrl: BASE_URL, email: 'me@example.com', apiToken: 'super-secret-token', fetchImpl });

    let caught;
    try {
      await client.search('bad jql');
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    expect(caught.message).toBe('Jira 400: Bad JQL');
    expect(caught.status).toBe(400);
    expect(caught.message).not.toContain('super-secret-token');
  });
});

describe('createJiraClient.addLabel', () => {
  it('sends a PUT with the correct URL and body', async () => {
    let captured;
    const fetchImpl = async (url, opts) => {
      captured = { url, opts };
      return { ok: true, status: 204, json: async () => ({}) };
    };

    const client = createJiraClient({ baseUrl: BASE_URL, email: 'me@example.com', apiToken: 'tok', fetchImpl });
    await client.addLabel('ABC-1', 'q4-pick');

    expect(captured.url).toBe(`${BASE_URL}/rest/api/3/issue/ABC-1`);
    expect(captured.opts.method).toBe('PUT');
    expect(JSON.parse(captured.opts.body)).toEqual({ update: { labels: [{ add: 'q4-pick' }] } });
  });
});

describe('createMockJiraClient', () => {
  it('search returns all 40 normalized fixture issues', async () => {
    const client = createMockJiraClient({});
    const result = await client.search('project = DEMO');
    expect(result).toHaveLength(40);
    expect(result[0]).toHaveProperty('key');
    expect(result[0]).toHaveProperty('url');
  });

  it('LIMIT=n convenience returns first n issues', async () => {
    const client = createMockJiraClient({});
    const result = await client.search('project = DEMO AND LIMIT=5');
    expect(result).toHaveLength(5);
  });

  it('addLabel mutates in-memory state and records the call', async () => {
    const client = createMockJiraClient({});
    const before = await client.search('LIMIT=1');
    const key = before[0].key;
    await client.addLabel(key, 'brand-new-label');
    const after = await client.search('LIMIT=1');
    expect(after[0].labels).toContain('brand-new-label');
    expect(client.calls).toEqual([{ op: 'add', key, label: 'brand-new-label' }]);
  });

  it('throws a 404 error for an unknown key', async () => {
    const client = createMockJiraClient({});
    let caught;
    try {
      await client.addLabel('NOPE-999', 'x');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught.status).toBe(404);
  });
});

describe('createJiraFromEnv', () => {
  it('throws when required vars are missing', () => {
    expect(() => createJiraFromEnv({})).toThrow(/Missing Jira config/);
  });

  it('returns a mock client when JIRA_MOCK=1', () => {
    const client = createJiraFromEnv({ JIRA_MOCK: '1' });
    expect(client).toHaveProperty('calls');
    expect(typeof client.search).toBe('function');
  });
});
