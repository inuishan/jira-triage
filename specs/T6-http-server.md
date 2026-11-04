# T6 — Express server and routes

**Wave:** 1 (tests use a stub service; no runtime dependency on T5) · **Suggested model:** sonnet
**Owns:** `server/routes.js`, `server/index.js`, `test/routes.test.js`

## server/routes.js
```js
export function createApp({ service, info }) -> express app
// info: { mock: boolean, jiraBaseUrl: string }  (for /api/health)
```
- `express.json({ limit: '100kb' })`.
- Implement every route in contracts "T6 — HTTP API", delegating to `service` methods (await everything; Express 5 forwards rejected promises to the error handler).
- Parse `:id` with `Number`; non-integer → 400 `{ error: 'Invalid session id' }`.
- `results.csv`: `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="triage-<id>.csv"`.
- Body validation at the edge: `decide` requires string `issueKey` and integer `categoryId`; `skip`/`reopen` require string `issueKey`; `PATCH` requires boolean `syncLabels`. → 400.
- Error handler maps per contracts. Import `NotFoundError`, `ValidationError` from `./triage.js` **by name check instead of import** to avoid coupling at test time: map `err.name === 'NotFoundError'` → 404, `err.name === 'ValidationError'` → 400, `typeof err.status === 'number'` → 502, else 500 with `{ error: 'Internal error' }` and `console.error(err)`. (T5 must set `this.name` on those classes — it's in its contract via class name; if not, report it.)
- Unknown `/api/*` → 404 JSON.

## server/index.js
- `import 'dotenv/config'`.
- `openDb(process.env.DB_PATH || 'data/triage.db')`, `createJiraFromEnv()`, `createTriageService({ db, jira })`, `createApp(...)`.
- If `web/dist/index.html` exists, serve `web/dist` statically and fall back to `index.html` for non-`/api` GETs (Express 5 path syntax: use `app.get(/^(?!\/api).*/, …)` or a final middleware).
- Listen on `127.0.0.1` and `process.env.PORT || 3001`. Log `Jira triage on http://127.0.0.1:<port> (mock Jira)` or `(Jira: <baseUrl>)`. Never log the token.
- If `createJiraFromEnv` throws (missing config), print the message and exit(1).

## Tests (`test/routes.test.js`)
Start the app on an ephemeral port (`app.listen(0)`) with a stub service object (vi.fn() methods), use global `fetch`. Close server in `afterAll`.
1. `GET /api/health` returns info.
2. POST sessions → 201 and passes body to `service.createSession`.
3. Invalid id → 400; decide missing categoryId → 400.
4. Service throws error with `name='NotFoundError'` → 404 `{error}`; `name='ValidationError'` → 400; `{status: 401}` → 502 with message; plain Error → 500 'Internal error'.
5. results.csv headers.
6. Unknown `/api/nope` → 404 JSON.

## Done when
`npx vitest run test/routes.test.js` and `npx eslint server/routes.js server/index.js test/routes.test.js` pass.
