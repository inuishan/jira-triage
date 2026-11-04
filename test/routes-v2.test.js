import { describe, it, expect, afterAll, beforeAll, vi, beforeEach } from 'vitest';
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
    listIssues: vi.fn(),
    getIssueDetail: vi.fn(),
    getStats: vi.fn(),
    getAttachment: vi.fn(),
  };
}

describe('routes v2', () => {
  let server;
  let baseUrl;
  let service;

  beforeEach(() => {
    service = makeService();
  });

  function start() {
    // One server for the file; it delegates to whichever stub `service` the current test set up.
    const proxy = new Proxy({}, { get: (_, name) => service[name] });
    const app = createApp({ service: proxy, info: { mock: true, jiraBaseUrl: 'https://mock.atlassian.net' } });
    return new Promise((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });
  }

  beforeAll(() => start());

  afterAll(() => {
    server?.close();
  });

  describe('GET /api/sessions/:id/issues', () => {
    it('passes through to service.listIssues', async () => {
      const issues = [{ key: 'ABC-1', summary: 'Test' }];
      service.listIssues.mockResolvedValue(issues);
      const res = await fetch(`${baseUrl}/api/sessions/1/issues`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual(issues);
      expect(service.listIssues).toHaveBeenCalledWith(1);
    });

    it('invalid session id -> 400', async () => {
      const res = await fetch(`${baseUrl}/api/sessions/abc/issues`);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Invalid session id' });
    });
  });

  describe('GET /api/sessions/:id/issues/:key/detail', () => {
    it('passes through to service.getIssueDetail', async () => {
      const detail = { key: 'ABC-1', summary: 'Test', url: 'https://...' };
      service.getIssueDetail.mockResolvedValue(detail);
      const res = await fetch(`${baseUrl}/api/sessions/1/issues/ABC-1/detail`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual(detail);
      expect(service.getIssueDetail).toHaveBeenCalledWith(1, 'ABC-1', { refresh: false });
    });

    it('passes refresh: true for ?refresh=1', async () => {
      const detail = { key: 'ABC-1', summary: 'Test' };
      service.getIssueDetail.mockResolvedValue(detail);
      const res = await fetch(`${baseUrl}/api/sessions/1/issues/ABC-1/detail?refresh=1`);
      expect(res.status).toBe(200);
      expect(service.getIssueDetail).toHaveBeenCalledWith(1, 'ABC-1', { refresh: true });
    });

    it('invalid issue key -> 400', async () => {
      const res = await fetch(`${baseUrl}/api/sessions/1/issues/invalid/detail`);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Invalid issue key' });
      expect(service.getIssueDetail).not.toHaveBeenCalled();
    });

    it('valid issue keys', async () => {
      service.getIssueDetail.mockResolvedValue({ key: 'ABC-1' });
      // Test valid keys
      for (const key of ['ABC-1', 'PROJ_123-456', 'A-1']) {
        await fetch(`${baseUrl}/api/sessions/1/issues/${key}/detail`);
        expect(service.getIssueDetail).toHaveBeenCalledWith(1, key, { refresh: false });
      }
    });

    it('NotFoundError on detail -> 404', async () => {
      const err = new Error('Issue not in session');
      err.name = 'NotFoundError';
      service.getIssueDetail.mockRejectedValue(err);
      const res = await fetch(`${baseUrl}/api/sessions/1/issues/ABC-1/detail`);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'Issue not in session' });
    });
  });

  describe('GET /api/sessions/:id/stats', () => {
    it('passes through to service.getStats', async () => {
      const stats = { counts: { total: 10, decided: 5, skipped: 0, undecided: 5 } };
      service.getStats.mockResolvedValue(stats);
      const res = await fetch(`${baseUrl}/api/sessions/1/stats`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual(stats);
      expect(service.getStats).toHaveBeenCalledWith(1);
    });
  });

  describe('GET /api/attachments/:attId', () => {
    it('invalid attId -> 400', async () => {
      const res = await fetch(`${baseUrl}/api/attachments/abc`);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Invalid attachment id' });
      expect(service.getAttachment).not.toHaveBeenCalled();
    });

    it('image/png Buffer -> 200 with image content-type, no disposition', async () => {
      const imageBytes = Buffer.from([137, 80, 78, 71]); // PNG magic bytes
      service.getAttachment.mockResolvedValue({
        body: imageBytes,
        contentType: 'image/png',
        contentLength: imageBytes.length,
      });
      const res = await fetch(`${baseUrl}/api/attachments/123`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/png');
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('content-security-policy')).toBe("sandbox; default-src 'none'");
      expect(res.headers.get('cache-control')).toBe('private, max-age=3600');
      expect(res.headers.get('content-disposition')).toBeNull();
      const body = await res.arrayBuffer();
      expect(Buffer.from(body)).toEqual(imageBytes);
      expect(service.getAttachment).toHaveBeenCalledWith('123', { thumbnail: false });
    });

    it('text/html Buffer -> content-type octet-stream with attachment disposition', async () => {
      const htmlBytes = Buffer.from('<html></html>');
      service.getAttachment.mockResolvedValue({
        body: htmlBytes,
        contentType: 'text/html',
        contentLength: htmlBytes.length,
      });
      const res = await fetch(`${baseUrl}/api/attachments/123`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/octet-stream');
      expect(res.headers.get('content-disposition')).toBe('attachment');
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('content-security-policy')).toBe("sandbox; default-src 'none'");
    });

    it('image/jpeg Buffer works', async () => {
      const jpegBytes = Buffer.from([255, 216, 255, 224]); // JPEG SOI marker
      service.getAttachment.mockResolvedValue({
        body: jpegBytes,
        contentType: 'image/jpeg',
        contentLength: jpegBytes.length,
      });
      const res = await fetch(`${baseUrl}/api/attachments/123`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/jpeg');
    });

    it('image/gif Buffer works', async () => {
      const gifBytes = Buffer.from('GIF89a');
      service.getAttachment.mockResolvedValue({
        body: gifBytes,
        contentType: 'image/gif',
        contentLength: gifBytes.length,
      });
      const res = await fetch(`${baseUrl}/api/attachments/123`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/gif');
    });

    it('image/webp Buffer works', async () => {
      const webpBytes = Buffer.from('RIFF');
      service.getAttachment.mockResolvedValue({
        body: webpBytes,
        contentType: 'image/webp',
        contentLength: webpBytes.length,
      });
      const res = await fetch(`${baseUrl}/api/attachments/123`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/webp');
    });

    it('ReadableStream body streams correctly', async () => {
      const streamData = 'Hello from stream';
      const blob = new Blob([streamData]);
      service.getAttachment.mockResolvedValue({
        body: blob.stream(),
        contentType: 'text/plain',
        contentLength: null,
      });
      const res = await fetch(`${baseUrl}/api/attachments/123`);
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toBe(streamData);
    });

    it('passes thumbnail: false to service', async () => {
      service.getAttachment.mockResolvedValue({
        body: Buffer.from('data'),
        contentType: 'image/png',
        contentLength: 4,
      });
      await fetch(`${baseUrl}/api/attachments/999`);
      expect(service.getAttachment).toHaveBeenCalledWith('999', { thumbnail: false });
    });
  });

  describe('GET /api/attachments/:attId/thumbnail', () => {
    it('invalid attId -> 400', async () => {
      const res = await fetch(`${baseUrl}/api/attachments/abc/thumbnail`);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Invalid attachment id' });
      expect(service.getAttachment).not.toHaveBeenCalled();
    });

    it('image/png Buffer -> 200 with image content-type', async () => {
      const imageBytes = Buffer.from([137, 80, 78, 71]);
      service.getAttachment.mockResolvedValue({
        body: imageBytes,
        contentType: 'image/png',
        contentLength: imageBytes.length,
      });
      const res = await fetch(`${baseUrl}/api/attachments/123/thumbnail`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/png');
      expect(res.headers.get('content-disposition')).toBeNull();
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('content-security-policy')).toBe("sandbox; default-src 'none'");
      expect(res.headers.get('cache-control')).toBe('private, max-age=3600');
    });

    it('text/html -> octet-stream with disposition', async () => {
      const htmlBytes = Buffer.from('<html></html>');
      service.getAttachment.mockResolvedValue({
        body: htmlBytes,
        contentType: 'text/html',
        contentLength: htmlBytes.length,
      });
      const res = await fetch(`${baseUrl}/api/attachments/123/thumbnail`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/octet-stream');
      expect(res.headers.get('content-disposition')).toBe('attachment');
    });

    it('passes thumbnail: true to service', async () => {
      service.getAttachment.mockResolvedValue({
        body: Buffer.from('data'),
        contentType: 'image/png',
        contentLength: 4,
      });
      await fetch(`${baseUrl}/api/attachments/999/thumbnail`);
      expect(service.getAttachment).toHaveBeenCalledWith('999', { thumbnail: true });
    });

    it('ReadableStream body works', async () => {
      const streamData = 'thumbnail data';
      const blob = new Blob([streamData]);
      service.getAttachment.mockResolvedValue({
        body: blob.stream(),
        contentType: 'image/png',
        contentLength: null,
      });
      const res = await fetch(`${baseUrl}/api/attachments/123/thumbnail`);
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toBe(streamData);
    });
  });

  describe('error handling', () => {
    it('service error on listIssues -> 500', async () => {
      service.listIssues.mockRejectedValue(new Error('db error'));
      const res = await fetch(`${baseUrl}/api/sessions/1/issues`);
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Internal error' });
    });

    it('NotFoundError on stats -> 404', async () => {
      const err = new Error('Session not found');
      err.name = 'NotFoundError';
      service.getStats.mockRejectedValue(err);
      const res = await fetch(`${baseUrl}/api/sessions/99/stats`);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'Session not found' });
    });

    it('Jira error on detail -> 502', async () => {
      const err = new Error('Jira 401: unauthorized');
      err.status = 401;
      service.getIssueDetail.mockRejectedValue(err);
      const res = await fetch(`${baseUrl}/api/sessions/1/issues/ABC-1/detail`);
      expect(res.status).toBe(502);
      expect(await res.json()).toEqual({ error: 'Jira 401: unauthorized' });
    });
  });
});
