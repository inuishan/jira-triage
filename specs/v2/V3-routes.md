# V3 — HTTP routes for v2 (server/routes.js)

**Wave:** 1 · **Model:** haiku
**Owns:** `server/routes.js` (add only), `test/routes-v2.test.js`

Read `specs/00-contracts.md` then `specs/v2/00-contracts-v2.md` (section V3) first. Look at how existing routes in `server/routes.js` are written (parseId, try/next) and follow the same style.

## Routes
- `GET /api/sessions/:id/issues` → `service.listIssues(id)`.
- `GET /api/sessions/:id/issues/:key/detail` → `service.getIssueDetail(id, key, { refresh: req.query.refresh === '1' })`. Validate `key` matches `/^[A-Z][A-Z0-9_]+-\d+$/` else 400 `{ error: 'Invalid issue key' }`.
- `GET /api/sessions/:id/stats` → `service.getStats(id)`.
- `GET /api/attachments/:attId` and `/api/attachments/:attId/thumbnail` → `service.getAttachment(attId, { thumbnail })`. `attId` must match `/^\d+$/` else 400.
  - Set headers exactly per contracts v2 (nosniff, CSP sandbox, image allow-list else octet-stream + `Content-Disposition: attachment`, Cache-Control).
  - Content-Length if known.
  - Body: if `Buffer` → `res.end(body)`; if web ReadableStream → `Readable.fromWeb(body).pipe(res)` (`import { Readable } from 'node:stream'`).
- Register these BEFORE the existing unknown-`/api/*` 404 handler.

## Tests `test/routes-v2.test.js`
Same approach as `test/routes.test.js` (stub service with `vi.fn()`, `app.listen(0)`, global fetch).
1. issues/stats/detail pass through; detail passes `{ refresh: true }` for `?refresh=1`.
2. Invalid issue key → 400; invalid attId → 400.
3. Attachment `image/png` Buffer → 200, content-type image/png, nosniff, CSP sandbox, no Content-Disposition, body bytes equal.
4. Attachment `text/html` → content-type `application/octet-stream` + `Content-Disposition: attachment`.
5. Attachment with web ReadableStream body (`new Blob(['hi']).stream()`) streams correctly.
6. Service throwing `{name:'NotFoundError'}` on detail → 404.
Note: local port binding may be blocked by the sandbox; if `listen` fails with EPERM, report it — the orchestrator will run the test.

## Done when
`npx eslint server/routes.js test/routes-v2.test.js` passes, and the test passes (or you reported the sandbox EPERM).
