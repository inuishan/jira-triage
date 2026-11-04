# 00 — Shared contracts (READ FIRST, DO NOT CHANGE)

Every task spec depends on this file. If you think a contract is wrong, stop and report it — do not change it unilaterally, other agents are coding against it in parallel.

## Ground rules for all tasks
- Node 24, ESM (`"type": "module"`), plain JavaScript (no TypeScript). Use `.js` for server/tests and `.jsx` for React components.
- Dependencies are **already installed**. Do NOT add or remove npm packages. Available: `express@5`, `dotenv`, `react@19`, `react-dom@19`, `vite`, `vitest`, `eslint`.
- SQLite = Node built-in `import { DatabaseSync } from 'node:sqlite'` (synchronous API: `db.exec`, `db.prepare(sql).run/get/all`). There is no `better-sqlite3`.
- Use global `fetch` (Node 24 has it).
- Only touch the files your spec lists under **Owns**. Never edit another task's files.
- Before finishing: `npx vitest run <your test files>` and `npx eslint <your files>` must pass. Use `/bin/rm` and `/bin/ls` instead of `rm`/`ls` (shell aliases can hang waiting for input). Prefer the Read/Write/Edit tools for files. Project root: `/Users/ishanjain/workspace/codex-workspace/jira-triage` — run commands from there.
- Never log or return `JIRA_API_TOKEN`. Never write to a real Jira in tests.
- Keep code small and readable. No over-engineering, no extra features beyond the spec.

## Project layout
```
server/
  index.js     (T6)  Express bootstrap
  routes.js    (T6)  HTTP routes -> triage service
  db.js        (T2)  SQLite schema + data access
  jira.js      (T3)  Jira client, mock client, normalizeIssue, adfToText
  triage.js    (T5)  business logic service
web/
  index.html, src/main.jsx   (done) — main.jsx imports App.jsx and styles.css
  src/api.js        (T4)
  src/useHotkeys.js (T4)
  src/styles.css    (T4)
  src/App.jsx       (T9)
  src/Home.jsx      (T7)
  src/Triage.jsx    (T8)
  src/Card.jsx      (T8)
  src/Results.jsx   (T9)
test/
  fixtures/issues.json  (T3)
  db.test.js     (T2)
  jira.test.js   (T3)
  triage.test.js (T5)
  routes.test.js (T6)
```

## Normalized Issue (the only issue shape outside jira.js)
```js
{
  key: 'ABC-123',
  url: 'https://site.atlassian.net/browse/ABC-123',
  summary: 'string',
  type: 'Bug' | null,          // fields.issuetype.name
  status: 'To Do' | null,      // fields.status.name
  priority: 'High' | null,     // fields.priority.name
  assignee: 'Jane Doe' | null, // fields.assignee.displayName
  reporter: 'John Roe' | null, // fields.reporter.displayName
  labels: ['a', 'b'],          // fields.labels or []
  components: ['API'],         // fields.components[].name or []
  created: '2026-01-02T03:04:05.000+0000' | null,
  updated: '...' | null,
  description: 'plain text' ,  // adfToText(fields.description), '' if none
}
```

## Category
```js
{ id: 1, sessionId: 1, name: 'Accept', jiraLabel: 'q4-pick' | null, hotkey: 'a', position: 0, isReject: false }
```
Default categories when a session is created without explicit categories:
`[{ name: 'Accept', jiraLabel: null, hotkey: 'a', isReject: false }, { name: 'Reject', jiraLabel: null, hotkey: 'r', isReject: true }]`.
Hotkeys are single lowercase chars; extra categories conventionally use `'1'..'9'`. `position` = array index at creation.

## Session (as returned by API)
```js
{ id: 1, name: 'Q4 pick', jql: 'project = ABC', syncLabels: false, createdAt: '2026-10-07T12:00:00.000Z',
  counts: { total: 160, decided: 42, skipped: 3, remaining: 118 } }   // remaining = total - decided (skipped count as remaining)
```
`createdAt`/`decidedAt` are ISO strings from `new Date().toISOString()`.

## Decision
```js
{ issueKey: 'ABC-1', categoryId: 1 | null, status: 'decided' | 'skipped', note: '' , decidedAt: 'ISO', labelSynced: false, seq: 7 }
```
`status: 'skipped'` ⇒ `categoryId: null`. `seq` is a monotonically increasing integer (SQLite AUTOINCREMENT-style) used for undo ordering.

## T2 — `server/db.js` exports
```js
openDb(path = 'data/triage.db') -> db         // creates tables if missing; ':memory:' allowed; enables foreign keys
createSession(db, { name, jql, categories? }) -> session   // inserts session + categories (defaults if omitted/empty); returns getSession()
getSession(db, id) -> session | null           // with counts
listSessions(db) -> session[]                  // newest first, with counts
setSyncLabels(db, id, bool) -> session
deleteSession(db, id) -> void                  // cascades everything
getCategories(db, sessionId) -> category[]     // ordered by position
upsertIssues(db, sessionId, issues[]) -> { added, updated }  // keyed by issue.key; position = index in array (re-applied on each refresh)
getIssue(db, sessionId, key) -> issue | null
getQueue(db, sessionId) -> issue[]
    // issues with NO decision first (ordered by position), then skipped ones (ordered by their seq ascending). Decided issues excluded.
setDecision(db, sessionId, { issueKey, categoryId, status, note = '' }) -> decision
    // upsert; always assigns a NEW seq (greater than all existing) and decidedAt = now; labelSynced reset to false
getDecision(db, sessionId, issueKey) -> decision | null
getLastDecision(db, sessionId) -> decision | null    // highest seq
deleteDecision(db, sessionId, issueKey) -> void
markLabelSynced(db, sessionId, issueKey, bool) -> void
listDecisions(db, sessionId) -> Array<decision & { issue: Issue }>   // ordered by seq ascending
```
Tables (snake_case columns; JS objects use camelCase):
- `sessions(id INTEGER PRIMARY KEY, name TEXT NOT NULL, jql TEXT NOT NULL, sync_labels INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)`
- `categories(id INTEGER PRIMARY KEY, session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, name TEXT NOT NULL, jira_label TEXT, hotkey TEXT NOT NULL, position INTEGER NOT NULL, is_reject INTEGER NOT NULL DEFAULT 0)`
- `issues(session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, issue_key TEXT NOT NULL, data TEXT NOT NULL /* JSON of Issue */, position INTEGER NOT NULL, fetched_at TEXT NOT NULL, PRIMARY KEY(session_id, issue_key))`
- `decisions(seq INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, issue_key TEXT NOT NULL, category_id INTEGER REFERENCES categories(id), status TEXT NOT NULL CHECK(status IN ('decided','skipped')), note TEXT NOT NULL DEFAULT '', decided_at TEXT NOT NULL, label_synced INTEGER NOT NULL DEFAULT 0, UNIQUE(session_id, issue_key))`
  - "Upsert with new seq" = `DELETE` existing row for (session, key) then `INSERT`.

## T3 — `server/jira.js` exports
```js
adfToText(adf) -> string                       // Atlassian Document Format -> plain text; handles null/undefined/string input
normalizeIssue(raw, baseUrl) -> Issue          // raw = Jira REST v3 issue {key, fields}
createJiraClient({ baseUrl, email, apiToken, fetchImpl = fetch }) -> JiraClient
createMockJiraClient({ issues = <fixture raw issues>, baseUrl = 'https://mock.atlassian.net' }) -> JiraClient & { calls: [] }
createJiraFromEnv(env = process.env) -> JiraClient   // JIRA_MOCK==='1' -> mock; else real (throws clear Error if vars missing)
SEARCH_FIELDS   // array of field names requested
```
`JiraClient`:
```js
{
  baseUrl: string,
  search(jql) -> Promise<Issue[]>            // ALL pages, normalized, in Jira's order
  addLabel(key, label) -> Promise<void>
  removeLabel(key, label) -> Promise<void>
}
```
Errors: non-2xx ⇒ throw `Error` with message `Jira <status>: <first errorMessages/errors text or statusText>` and property `status`.

## T5 — `server/triage.js` exports
```js
createTriageService({ db, jira }) -> {
  createSession({ name, jql, categories? }) -> Promise<session>   // validates, creates, fetches issues via jira.search, upserts; if fetch fails the session is deleted and error rethrown
  listSessions() -> session[]
  getSession(id) -> { ...session, categories }          // throws NotFoundError
  refresh(id) -> Promise<{ added, updated, session }>
  setSyncLabels(id, bool) -> session
  deleteSession(id) -> void
  getQueue(id) -> issue[]
  decide(id, { issueKey, categoryId, note }) -> Promise<{ decision, warning?: string, session }>
  skip(id, { issueKey }) -> { decision, session }
  undo(id) -> Promise<{ issueKey: string|null, warning?: string, session }>     // reverts last decision (highest seq)
  reopen(id, issueKey) -> Promise<{ issueKey, warning?: string, session }>      // removes decision for a specific key
  syncLabels(id) -> Promise<{ synced: number, failed: Array<{issueKey, error}> }>
  getResults(id) -> { session, categories, groups: Array<{ category, items: Array<{ issue, note, decidedAt }>, jql }>, skipped: Issue[] }
  resultsCsv(id) -> string
}
export class NotFoundError extends Error { name = 'NotFoundError' }
export class ValidationError extends Error { name = 'ValidationError' }
// routes.js maps errors by err.name, not instanceof
```

## T6 — HTTP API (all JSON; errors → `{ error: message }`)
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/health` | – | `{ ok: true, mock: bool, jiraBaseUrl }` |
| GET | `/api/sessions` | – | `session[]` |
| POST | `/api/sessions` | `{ name, jql, categories? }` | `201 session+categories` |
| GET | `/api/sessions/:id` | – | `session+categories` |
| DELETE | `/api/sessions/:id` | – | `204` |
| PATCH | `/api/sessions/:id` | `{ syncLabels }` | `session` |
| POST | `/api/sessions/:id/refresh` | – | `{ added, updated, session }` |
| GET | `/api/sessions/:id/queue` | – | `Issue[]` |
| POST | `/api/sessions/:id/decide` | `{ issueKey, categoryId, note? }` | `{ decision, warning?, session }` |
| POST | `/api/sessions/:id/skip` | `{ issueKey }` | `{ decision, session }` |
| POST | `/api/sessions/:id/undo` | – | `{ issueKey, warning?, session }` |
| POST | `/api/sessions/:id/reopen` | `{ issueKey }` | `{ issueKey, warning?, session }` |
| POST | `/api/sessions/:id/sync-labels` | – | `{ synced, failed }` |
| GET | `/api/sessions/:id/results` | – | results object |
| GET | `/api/sessions/:id/results.csv` | – | `text/csv` attachment |

Status codes: `NotFoundError`→404, `ValidationError`→400, errors with numeric `.status` from Jira→502 (message passed through), else 500.

## T4 — `web/src/api.js` exports (thin fetch wrappers, all return parsed JSON, throw `Error(body.error || statusText)` on non-2xx)
```js
health(), listSessions(), createSession(body), getSession(id), deleteSession(id), updateSession(id, patch),
refresh(id), getQueue(id), decide(id, body), skip(id, body), undo(id), reopen(id, issueKey),
syncLabels(id), getResults(id), resultsCsvUrl(id) /* returns string URL, no fetch */
```

## T4 — `web/src/useHotkeys.js`
```js
export default function useHotkeys(map, enabled = true)
// map: { [key]: (event) => void }. key is event.key lowercased for single chars ('a', '1', '?'),
// or exact names: 'ArrowLeft', 'ArrowRight', 'ArrowDown', 'Escape', 'Enter'. Also 'mod+z' for Ctrl/Cmd+Z.
// Ignores events when focus is in input/textarea/select/contenteditable (except 'Escape').
// Ignores events with alt/ctrl/meta modifiers unless key is 'mod+…'. Calls preventDefault when handled.
```

## UI routing (T9 owns App.jsx)
Hash routes: `#/` → `<Home/>`, `#/s/:id` → `<Triage sessionId={id}/>`, `#/s/:id/results` → `<Results sessionId={id}/>`.
Navigate with `location.hash = '#/s/3'`. Components are default exports with exactly those props.

## CSS class vocabulary (T4 defines in styles.css; T7–T9 use these, may add inline styles only for one-offs)
`app`, `topbar`, `container`, `btn`, `btn-primary`, `btn-danger`, `btn-ghost`, `kbd`, `card`, `card-header`, `card-key`, `card-summary`, `chips`, `chip`, `meta`, `description`, `description.expanded`, `actions`, `progress`, `progress-bar`, `toast`, `toast-error`, `modal-backdrop`, `modal`, `form-row`, `session-list`, `session-item`, `tabs`, `tab`, `tab.active`, `table`, `muted`, `empty`.
