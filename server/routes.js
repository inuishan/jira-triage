import express from 'express';
import { Readable } from 'node:stream';

function parseId(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: 'Invalid session id' });
    return null;
  }
  return id;
}

export function createApp({ service, info }) {
  const app = express();
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (req, res) => {
    res.json({ ok: true, mock: info.mock, jiraBaseUrl: info.jiraBaseUrl });
  });

  app.get('/api/sessions', async (req, res, next) => {
    try {
      res.json(await service.listSessions());
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/sessions', async (req, res, next) => {
    try {
      const session = await service.createSession(req.body || {});
      res.status(201).json(session);
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/sessions/:id', async (req, res, next) => {
    const id = parseId(req, res);
    if (id === null) return;
    try {
      res.json(await service.getSession(id));
    } catch (err) {
      next(err);
    }
  });

  app.delete('/api/sessions/:id', async (req, res, next) => {
    const id = parseId(req, res);
    if (id === null) return;
    try {
      await service.deleteSession(id);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  app.patch('/api/sessions/:id', async (req, res, next) => {
    const id = parseId(req, res);
    if (id === null) return;
    if (typeof req.body?.syncLabels !== 'boolean') {
      res.status(400).json({ error: 'syncLabels must be a boolean' });
      return;
    }
    try {
      res.json(await service.setSyncLabels(id, req.body.syncLabels));
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/sessions/:id/refresh', async (req, res, next) => {
    const id = parseId(req, res);
    if (id === null) return;
    try {
      res.json(await service.refresh(id));
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/sessions/:id/queue', async (req, res, next) => {
    const id = parseId(req, res);
    if (id === null) return;
    try {
      res.json(await service.getQueue(id));
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/sessions/:id/decide', async (req, res, next) => {
    const id = parseId(req, res);
    if (id === null) return;
    const { issueKey, categoryId, note } = req.body || {};
    if (typeof issueKey !== 'string' || !Number.isInteger(categoryId)) {
      res.status(400).json({ error: 'issueKey (string) and categoryId (integer) are required' });
      return;
    }
    try {
      res.json(await service.decide(id, { issueKey, categoryId, note }));
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/sessions/:id/skip', async (req, res, next) => {
    const id = parseId(req, res);
    if (id === null) return;
    const { issueKey } = req.body || {};
    if (typeof issueKey !== 'string') {
      res.status(400).json({ error: 'issueKey (string) is required' });
      return;
    }
    try {
      res.json(await service.skip(id, { issueKey }));
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/sessions/:id/undo', async (req, res, next) => {
    const id = parseId(req, res);
    if (id === null) return;
    try {
      res.json(await service.undo(id));
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/sessions/:id/reopen', async (req, res, next) => {
    const id = parseId(req, res);
    if (id === null) return;
    const { issueKey } = req.body || {};
    if (typeof issueKey !== 'string') {
      res.status(400).json({ error: 'issueKey (string) is required' });
      return;
    }
    try {
      res.json(await service.reopen(id, issueKey));
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/sessions/:id/sync-labels', async (req, res, next) => {
    const id = parseId(req, res);
    if (id === null) return;
    try {
      res.json(await service.syncLabels(id));
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/sessions/:id/results', async (req, res, next) => {
    const id = parseId(req, res);
    if (id === null) return;
    try {
      res.json(await service.getResults(id));
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/sessions/:id/results.csv', async (req, res, next) => {
    const id = parseId(req, res);
    if (id === null) return;
    try {
      const csv = await service.resultsCsv(id);
      res.status(200);
      res.set('Content-Type', 'text/csv; charset=utf-8');
      res.set('Content-Disposition', `attachment; filename="triage-${id}.csv"`);
      res.send(csv);
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/sessions/:id/issues', async (req, res, next) => {
    const id = parseId(req, res);
    if (id === null) return;
    try {
      res.json(await service.listIssues(id));
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/sessions/:id/issues/:key/detail', async (req, res, next) => {
    const id = parseId(req, res);
    if (id === null) return;
    const { key } = req.params;
    if (!/^[A-Z][A-Z0-9_]*-\d+$/.test(key)) {
      res.status(400).json({ error: 'Invalid issue key' });
      return;
    }
    try {
      const detail = await service.getIssueDetail(id, key, { refresh: req.query.refresh === '1' });
      res.json(detail);
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/sessions/:id/stats', async (req, res, next) => {
    const id = parseId(req, res);
    if (id === null) return;
    try {
      res.json(await service.getStats(id));
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/attachments/:attId', async (req, res, next) => {
    const { attId } = req.params;
    if (!/^\d+$/.test(attId)) {
      res.status(400).json({ error: 'Invalid attachment id' });
      return;
    }
    try {
      const { body, contentType, contentLength } = await service.getAttachment(attId, { thumbnail: false });
      res.set('X-Content-Type-Options', 'nosniff');
      res.set('Content-Security-Policy', "sandbox; default-src 'none'");
      res.set('Cache-Control', 'private, max-age=3600');
      if (contentLength !== null && contentLength !== undefined) {
        res.set('Content-Length', String(contentLength));
      }
      // Only allow specific image types; everything else is treated as attachment
      if (/^image\/(png|jpeg|gif|webp)$/.test(contentType)) {
        res.set('Content-Type', contentType);
      } else {
        res.set('Content-Type', 'application/octet-stream');
        res.set('Content-Disposition', 'attachment');
      }
      // Handle Buffer vs ReadableStream
      if (Buffer.isBuffer(body)) {
        res.end(body);
      } else {
        Readable.fromWeb(body).pipe(res);
      }
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/attachments/:attId/thumbnail', async (req, res, next) => {
    const { attId } = req.params;
    if (!/^\d+$/.test(attId)) {
      res.status(400).json({ error: 'Invalid attachment id' });
      return;
    }
    try {
      const { body, contentType, contentLength } = await service.getAttachment(attId, { thumbnail: true });
      res.set('X-Content-Type-Options', 'nosniff');
      res.set('Content-Security-Policy', "sandbox; default-src 'none'");
      res.set('Cache-Control', 'private, max-age=3600');
      if (contentLength !== null && contentLength !== undefined) {
        res.set('Content-Length', String(contentLength));
      }
      // Only allow specific image types; everything else is treated as attachment
      if (/^image\/(png|jpeg|gif|webp)$/.test(contentType)) {
        res.set('Content-Type', contentType);
      } else {
        res.set('Content-Type', 'application/octet-stream');
        res.set('Content-Disposition', 'attachment');
      }
      // Handle Buffer vs ReadableStream
      if (Buffer.isBuffer(body)) {
        res.end(body);
      } else {
        Readable.fromWeb(body).pipe(res);
      }
    } catch (err) {
      next(err);
    }
  });

  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.name === 'NotFoundError') {
      res.status(404).json({ error: err.message });
    } else if (err.name === 'ValidationError') {
      res.status(400).json({ error: err.message });
    } else if (typeof err.status === 'number') {
      res.status(502).json({ error: err.message });
    } else {
      console.error(err);
      res.status(500).json({ error: 'Internal error' });
    }
  });

  return app;
}
