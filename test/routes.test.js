import { describe, it, expect, afterAll, vi, beforeEach } from 'vitest';
import { createApp } from '../server/routes.js';

function makeService() {
  return {
    listSessions: vi.fn(),
    createSession: vi.fn(),
    getSession: vi.fn(),
    deleteSession: vi.fn(),
    setSyncLabels: vi.fn(),
    refresh: vi.fn(),
    getQueue: vi.fn(),
    decide: vi.fn(),
    skip: vi.fn(),
    undo: vi.fn(),
    reopen: vi.fn(),
    syncLabels: vi.fn(),
    getResults: vi.fn(),
    resultsCsv: vi.fn(),
  };
}

describe('routes', () => {
  let server;
  let baseUrl;
  let service;

  beforeEach(() => {
    service = makeService();
  });

  function start() {
    const app = createApp({ service, info: { mock: true, jiraBaseUrl: 'https://mock.atlassian.net' } });
    return new Promise((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });
  }

  afterAll(() => {
    server?.close();
  });

  it('GET /api/health returns info', async () => {
    await start();
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, mock: true, jiraBaseUrl: 'https://mock.atlassian.net' });
  });

  it('POST /api/sessions returns 201 and passes body to service.createSession', async () => {
    await start();
    const session = { id: 1, name: 'Q4', jql: 'project = ABC' };
    service.createSession.mockResolvedValue(session);
    const res = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Q4', jql: 'project = ABC' }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual(session);
    expect(service.createSession).toHaveBeenCalledWith({ name: 'Q4', jql: 'project = ABC' });
  });

  it('invalid session id -> 400', async () => {
    await start();
    const res = await fetch(`${baseUrl}/api/sessions/abc`);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid session id' });
  });

  it('decide missing categoryId -> 400', async () => {
    await start();
    const res = await fetch(`${baseUrl}/api/sessions/1/decide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ issueKey: 'ABC-1' }),
    });
    expect(res.status).toBe(400);
    expect(service.decide).not.toHaveBeenCalled();
  });

  it('NotFoundError -> 404', async () => {
    await start();
    const err = new Error('nope');
    err.name = 'NotFoundError';
    service.getSession.mockRejectedValue(err);
    const res = await fetch(`${baseUrl}/api/sessions/1`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'nope' });
  });

  it('ValidationError -> 400', async () => {
    await start();
    const err = new Error('bad');
    err.name = 'ValidationError';
    service.createSession.mockRejectedValue(err);
    const res = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Q4', jql: 'x' }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad' });
  });

  it('error with numeric status -> 502 with message passed through', async () => {
    await start();
    const err = new Error('Jira 401: unauthorized');
    err.status = 401;
    service.refresh.mockRejectedValue(err);
    const res = await fetch(`${baseUrl}/api/sessions/1/refresh`, { method: 'POST' });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'Jira 401: unauthorized' });
  });

  it('plain Error -> 500 Internal error', async () => {
    await start();
    service.listSessions.mockRejectedValue(new Error('boom'));
    const res = await fetch(`${baseUrl}/api/sessions`);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal error' });
  });

  it('results.csv has csv headers', async () => {
    await start();
    service.resultsCsv.mockResolvedValue('key,summary\nABC-1,Test\n');
    const res = await fetch(`${baseUrl}/api/sessions/1/results.csv`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="triage-1.csv"');
    expect(await res.text()).toBe('key,summary\nABC-1,Test\n');
  });

  it('unknown /api/* -> 404 JSON', async () => {
    await start();
    const res = await fetch(`${baseUrl}/api/nope`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not found' });
  });
});
