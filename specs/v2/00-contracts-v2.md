# v2 — Jira-like detail view, issue sidebar, metrics (READ FIRST, DO NOT CHANGE)

v1 contracts in `specs/00-contracts.md` still apply (ground rules, existing exports, error mapping). This file only adds/changes things. If something here looks wrong, stop and report it instead of improvising — other agents code against it in parallel.

## Extra ground rules for v2
- **Never call the real Jira.** A real `.env` with live credentials exists in the project root. Do NOT start `server/index.js`, do NOT run anything that loads `.env`, do NOT read `.env` or `data/triage.db` (real customer ticket data). Tests use mocks/fixtures only. The orchestrator does integration testing.
- Do not add npm packages. React rendering in tests: `import { renderToStaticMarkup } from 'react-dom/server'` (works in the node test environment). Test files may be `.test.jsx` (vitest `include` already covers `test/**/*.test.js`; v2 widens it to `.jsx` — orchestrator handles config).
- Never use `dangerouslySetInnerHTML` anywhere. All Jira content is rendered as React elements/text.
- Each frontend component owns its own CSS file (`import './Sidebar.css'`). Use CSS variables already defined in `web/src/styles.css` `:root` (`--bg`, `--bg-alt`, `--fg`, `--fg-secondary`, `--border`, `--blue`, `--shadow`, etc. — read the file to see exact names). Do not edit `styles.css`.
- Fake data in fixtures must be obviously fake (no real people/customers). Project key `DEMO`.

---

## Data shapes

### Person
`{ displayName: string, accountId: string | null }`

### IssueRef (linked issues, subtasks, parent)
`{ key, summary, status: string|null, statusCategory: 'new'|'indeterminate'|'done'|null, type: string|null, priority: string|null, url }`

### DisplayValue (custom field values)
`string | { adf: ADFDoc }` — produced by `customFieldToDisplay` (see V1). Empty values are omitted entirely.

### IssueDetail (returned by `GET /api/sessions/:id/issues/:key/detail`)
```js
{
  key, url, summary,
  type, status, statusCategory, priority, resolution,            // strings|null
  assignee: Person|null, reporter: Person|null, creator: Person|null,
  created, updated, resolved, dueDate,                             // ISO/date strings|null
  labels: string[], components: string[],
  fixVersions: string[], affectsVersions: string[],
  parent: IssueRef|null,
  subtasks: IssueRef[],
  links: Array<{ id, label: string /* e.g. 'blocks', 'is blocked by' */, issue: IssueRef }>,
  descriptionAdf: ADFDoc|null,
  environmentAdf: ADFDoc|null,
  timeTracking: { originalEstimate, remainingEstimate, timeSpent } | null,   // strings like '3d 4h'
  attachments: Array<{ id: string, filename, mimeType, size: number, created, author: Person|null,
                       contentUrl: '/api/attachments/<id>', thumbnailUrl: '/api/attachments/<id>/thumbnail' | null /* null unless mimeType starts with image/ */ }>,
  comments: Array<{ id, author: Person|null, created, updated, bodyAdf: ADFDoc|null }>,   // oldest first
  commentTotal: number,
  customFields: Array<{ id: 'customfield_10020', name: 'Sprint', value: DisplayValue }>,   // sorted by name, non-empty only
  fetchedAt: ISO string,     // when the server fetched it from Jira
}
```
ADFDoc = Atlassian Document Format root `{ type: 'doc', version: 1, content: [...] }`.

### IssueListItem (returned by `GET /api/sessions/:id/issues`)
```js
{ key, summary, type, status, priority, assignee, url, position,
  decision: null | { status: 'decided'|'skipped', categoryId: number|null, note: string, decidedAt: string } }
```
Ordered by `position` (Jira's JQL order).

### Stats (returned by `GET /api/sessions/:id/stats`)
```js
{
  counts: { total, decided, skipped, undecided },          // undecided = total - decided - skipped
  byCategory: Array<{ categoryId, name, isReject, count }>, // all categories in position order, count may be 0
  pace: {
    decidedToday: number,               // decisions (status decided) with decidedAt on the server's local calendar day
    avgSecondsPerDecision: number|null, // median gap between consecutive decidedAt of the last 20 decided, gaps > 600s ignored; null if < 2
    etaMinutes: number|null,            // round(avg * (undecided + skipped) / 60); null if avg null
  },
  breakdown: {                          // each: Array<{ value: string /* 'None' for null */, total, undecided, byCategory: { [categoryId]: count } }>, sorted by total desc
    priority: [...], type: [...], status: [...],
    assignee: [...]                     // top 10 by total, rest merged into value 'Other'
  }
}
```

---

## Server additions

### V1 — `server/jira.js` (add, keep existing exports unchanged)
```js
export const DETAIL_FIELDS = '*all'
export function customFieldToDisplay(raw) -> DisplayValue | null
export function normalizeIssueDetail(raw /* GET issue response incl. names */, baseUrl) -> IssueDetail (fetchedAt = now)
JiraClient.getIssueDetail(key) -> Promise<IssueDetail>
JiraClient.getAttachment(attachmentId, { thumbnail = false }) -> Promise<{ body: ReadableStream|Buffer, contentType: string, contentLength: number|null }>
```
Mock client implements both (see V1 spec).

### V2 — `server/db.js` (add)
```js
// new table, created in openDb:
// issue_details(issue_key TEXT PRIMARY KEY, data TEXT NOT NULL, fetched_at TEXT NOT NULL)   -- global, not per session
saveIssueDetail(db, detail) -> void                  // upsert by detail.key; fetched_at = detail.fetchedAt
getCachedIssueDetail(db, key) -> IssueDetail|null    // parsed JSON
listIssuesWithDecisions(db, sessionId) -> IssueListItem[]
getStats(db, sessionId, now = new Date()) -> Stats
```

### V4 — `server/triage.js` (add to the object returned by createTriageService)
```js
listIssues(id) -> IssueListItem[]
getIssueDetail(id, key, { refresh = false } = {}) -> Promise<IssueDetail>
    // key must be in session (NotFoundError). Return cached if fetchedAt younger than 10 min and !refresh; else jira.getIssueDetail, saveIssueDetail, return.
    // If Jira fails and a cache exists (any age), return the cached one with extra prop `stale: true` instead of throwing.
getStats(id) -> Stats
getAttachment(attachmentId, { thumbnail }) -> Promise<{ body, contentType, contentLength }>
    // attachmentId must match /^\d+$/ else ValidationError. Mock mode works via mock client.
```
`decide` already supports changing an existing decision — no change.

### V3 — HTTP routes (`server/routes.js`, add)
| Method | Path | Response |
|---|---|---|
| GET | `/api/sessions/:id/issues` | `IssueListItem[]` |
| GET | `/api/sessions/:id/issues/:key/detail` | `IssueDetail` (`?refresh=1` → `{ refresh: true }`) |
| GET | `/api/sessions/:id/stats` | `Stats` |
| GET | `/api/attachments/:attId` | binary stream |
| GET | `/api/attachments/:attId/thumbnail` | binary stream |

Attachment responses MUST set (security — attachments are untrusted content served from our origin):
- `X-Content-Type-Options: nosniff`
- `Content-Security-Policy: sandbox; default-src 'none'`
- `Content-Type`: the upstream type **only if** it matches `^image/(png|jpeg|gif|webp)$`, otherwise `application/octet-stream` plus `Content-Disposition: attachment`.
- `Cache-Control: private, max-age=3600`.

---

## Frontend

### `web/src/api.js` additions (V9 owns)
```js
listIssues(id), getIssueDetail(id, key, { refresh } = {}), getStats(id)
```

### Component contracts (props are exact; all default exports)

**V5 `web/src/AdfRenderer.jsx`**
```jsx
<AdfRenderer doc={ADFDoc|null} attachments={IssueDetail.attachments = []} onIssueKeyClick={(key) => void} />
```
Also named export `FieldValue({ value: DisplayValue, attachments, onIssueKeyClick })` — string → text (with issue-key linking, see V5), `{adf}` → `<AdfRenderer>`.

**V6 `web/src/Sidebar.jsx`** (+ `Sidebar.css`)
```jsx
<Sidebar
  issues={IssueListItem[]}
  categories={Category[]}
  currentKey={string|null}
  filter={'all'|'undecided'|'skipped'|`cat:${categoryId}`}
  onFilterChange={(filter) => void}
  search={string}
  onSearchChange={(text) => void}
  onSelect={(key) => void}
  searchInputRef={React ref}          // parent focuses it on '/'
/>
```
Also named export `filterIssues(issues, filter, search) -> IssueListItem[]` (pure; parent uses it for j/k navigation).

**V7 `web/src/StatsPanel.jsx`** (+ `StatsPanel.css`)
```jsx
<StatsPanel stats={Stats|null} categories={Category[]} compact={boolean} />
```
`compact` = single-row strip for the top bar; non-compact = full panel (modal/drawer content).

**V8 `web/src/IssueDetail.jsx`** (+ `IssueDetail.css`)
```jsx
<IssueDetail
  detail={IssueDetail|null}          // null while loading
  fallback={IssueListItem|null}      // shown (summary/chips) while detail loads
  loading={boolean}
  error={string|null}
  onRefresh={() => void}
  onIssueKeyClick={(key) => void}    // parent: select if in session, else open Jira
/>
```

**V9 `web/src/Triage.jsx`** (+ `Triage.css`) — page orchestrator, `Triage({ sessionId })` (unchanged props).

### Category colors (shared convention)
Category color = by index in `categories` (position order), non-reject: `['#2f9e44', '#1971c2', '#9c36b5', '#e8590c', '#0c8599', '#5c940d', '#c2255c', '#5f3dc4', '#868e96']`; reject category always `#e03131`; skipped `#868e96`; undecided = no color/outline.
Export from V6 as named `categoryColor(category, categories) -> string` and import it in V7/V8/V9 from `./Sidebar.jsx`.
