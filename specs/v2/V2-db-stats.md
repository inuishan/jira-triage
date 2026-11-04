# V2 — DB: detail cache, issue list, stats (server/db.js)

**Wave:** 1 · **Model:** sonnet
**Owns:** `server/db.js` (add only — keep existing exports/behavior), `test/db-v2.test.js`

Read `specs/00-contracts.md` then `specs/v2/00-contracts-v2.md` first.

## Schema
In `openDb`, add `CREATE TABLE IF NOT EXISTS issue_details(issue_key TEXT PRIMARY KEY, data TEXT NOT NULL, fetched_at TEXT NOT NULL)`. Existing DB files must keep working (IF NOT EXISTS only; no migrations of other tables).

## Functions
- `saveIssueDetail(db, detail)` — `INSERT ... ON CONFLICT(issue_key) DO UPDATE`.
- `getCachedIssueDetail(db, key)` — parsed JSON or null.
- `listIssuesWithDecisions(db, sessionId)` — one LEFT JOIN query issues↔decisions ordered by `i.position`. Build `IssueListItem` from parsed issue JSON (`key, summary, type, status, priority, assignee, url`) + `position` + `decision` (null or `{ status, categoryId, note, decidedAt }`).
- `getStats(db, sessionId, now = new Date())` — exactly the `Stats` shape in contracts v2:
  - `counts`, `byCategory` (every category, count 0 allowed, position order).
  - `pace.decidedToday`: compare `new Date(decidedAt)` local Y-M-D to `now` local Y-M-D.
  - `pace.avgSecondsPerDecision`: take decided decisions ordered by `decided_at`, last 20, consecutive gaps in seconds, drop gaps > 600, **median** of remaining; null if no gaps. Round to 1 decimal.
  - `pace.etaMinutes`: `Math.round(avg * (undecided + skipped) / 60)` or null.
  - `breakdown`: computed in JS from `listIssuesWithDecisions`. For each dimension (`priority`, `type`, `status`, `assignee`): group by value (`null` → `'None'`); per group `total`, `undecided` (no decision OR skipped), `byCategory` (only decided, keyed by categoryId as string-keyed object). Sort by total desc then value asc. `assignee`: top 10, remaining merged into one `'Other'` row (sum counts).

## Tests `test/db-v2.test.js` (`openDb(':memory:')`)
1. issue_details save/get roundtrip; upsert overwrites.
2. Opening an existing file DB created by the old schema works (create a temp file DB via openDb, close, reopen → table exists). Use `os.tmpdir()`.
3. listIssuesWithDecisions: order by position, decision null/decided/skipped mapped.
4. getStats counts/byCategory with zero-count category.
5. breakdown priority with nulls → 'None', sorted; assignee top-10 + Other (create 12 assignees).
6. pace: insert decisions then UPDATE `decided_at` directly via SQL to controlled timestamps (gaps 10s, 20s, 30s, 900s) → median of [10,20,30] = 20; decidedToday with a `now` argument; eta = round(20 * remaining / 60).

## Done when
`npx vitest run test/db-v2.test.js test/db.test.js` and `npx eslint server/db.js test/db-v2.test.js` pass.
