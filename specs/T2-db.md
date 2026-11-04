# T2 — SQLite data layer

**Wave:** 1 · **Depends on:** contracts only · **Suggested model:** sonnet
**Owns:** `server/db.js`, `test/db.test.js`

## Goal
Implement every function listed under "T2 — server/db.js exports" in `specs/00-contracts.md`, with the exact table schema given there.

## Details
- `openDb(path)`: if path isn't `':memory:'`, `mkdirSync(dirname(path), { recursive: true })`. Run `PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;` (skip WAL for `:memory:`). Create tables with `CREATE TABLE IF NOT EXISTS`. Add index `decisions(session_id, seq)`.
- Row → object mappers: `toSession(row, counts)`, `toCategory(row)`, `toDecision(row)`. Booleans from INTEGER 0/1. `labelSynced`, `isReject`, `syncLabels` are real booleans.
- Counts for a session (single query is fine):
  - `total` = issues in session
  - `decided` = decisions with status 'decided'
  - `skipped` = decisions with status 'skipped'
  - `remaining` = total - decided
- `createSession`: wrap in a transaction (`db.exec('BEGIN')` / `COMMIT` / `ROLLBACK` on error). Trim name/jql. Categories: if missing/empty use defaults from contracts. Each category input: `{ name, jiraLabel?, hotkey, isReject? }`; empty-string jiraLabel ⇒ null.
- `upsertIssues`: transaction; `INSERT ... ON CONFLICT(session_id, issue_key) DO UPDATE SET data=excluded.data, position=excluded.position, fetched_at=excluded.fetched_at`. Count added vs updated by checking existence first. Issues no longer returned by Jira are NOT deleted (keep history).
- `getQueue`: one SQL query:
  ```sql
  SELECT i.data FROM issues i
  LEFT JOIN decisions d ON d.session_id = i.session_id AND d.issue_key = i.issue_key
  WHERE i.session_id = ? AND (d.status IS NULL OR d.status = 'skipped')
  ORDER BY (d.status IS NOT NULL), d.seq, i.position
  ```
  Parse `data` JSON.
- `setDecision`: DELETE then INSERT in a transaction, return `getDecision`.
- `listDecisions`: join issues to attach parsed `issue` (null if the issue row is missing).
- `deleteSession`: rely on ON DELETE CASCADE.

## Tests (`test/db.test.js`, vitest, `openDb(':memory:')` per test)
1. createSession with no categories → 2 default categories, positions 0/1, Reject has isReject true.
2. createSession with custom categories preserves order, hotkeys, jiraLabel; `''` label → null.
3. upsertIssues returns {added, updated} correctly across two calls; second call updates data & position.
4. getQueue: undecided in position order; decided excluded; skipped moved to end ordered by seq.
5. setDecision twice on same key → single row, new seq larger than previous, labelSynced reset to false.
6. getLastDecision returns highest seq; deleteDecision removes it; then getLastDecision returns the previous.
7. counts: total/decided/skipped/remaining correct.
8. listSessions newest first; deleteSession cascades (getCategories returns [], getQueue returns []).
9. markLabelSynced flips flag.
Use small hand-made Issue objects (`{ key:'A-1', summary:'x', labels:[], components:[], ... }`).

## Done when
`npx vitest run test/db.test.js` and `npx eslint server/db.js test/db.test.js` pass.
