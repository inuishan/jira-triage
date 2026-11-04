# T5 — Triage service (business logic)

**Wave:** 2 (needs T2 + T3 merged) · **Suggested model:** sonnet
**Owns:** `server/triage.js`, `test/triage.test.js`

## Goal
Implement `createTriageService({ db, jira })`, `NotFoundError`, `ValidationError` exactly as in contracts "T5". Use only `server/db.js` functions for persistence and the `JiraClient` interface for Jira.

## Behavior
- **createSession**: `name` and `jql` required non-empty strings (trimmed) else `ValidationError`. Categories (optional array): each needs `name`, `hotkey` (single char, lowercased); hotkeys unique within session and must not be `s`, `u`, `o`, `n`, `?` (reserved) → `ValidationError`. At most one `isReject: true`. Create via db, then `jira.search(jql)` → `upsertIssues`. On search failure: `deleteSession` and rethrow. Return `getSession(id)` (with categories).
- **getSession(id)**: `NotFoundError('Session not found')` if missing. Every method taking `id` validates it the same way.
- **refresh**: re-run search, upsert, return counts + session.
- **decide(id, { issueKey, categoryId, note })**:
  - Issue must exist in session (`getIssue`) else `NotFoundError('Issue not in session')`. Category must belong to session else `ValidationError`.
  - If an existing *decided* decision had `labelSynced` and its category had a jiraLabel different from the new one, try `jira.removeLabel` for the old label first (failure → warning, continue).
  - `setDecision(status 'decided')`.
  - If `session.syncLabels && category.jiraLabel` → `await jira.addLabel(issueKey, category.jiraLabel)`; success → `markLabelSynced(true)`; failure → keep decision, return `warning: "Saved locally, but Jira label failed: <msg>"`.
  - Return `{ decision: getDecision(...), warning?, session: getSession(id) }`.
- **skip**: issue must exist; `setDecision({ status: 'skipped', categoryId: null })`.
- **undo(id)**: `getLastDecision`; none → `{ issueKey: null, session }`. Otherwise same removal as `reopen`.
- **reopen(id, issueKey)**: decision must exist else `NotFoundError`. If `labelSynced` and category has jiraLabel → `jira.removeLabel` (failure → warning, still delete). `deleteDecision`.
- **syncLabels(id)**: for each decided decision where category has jiraLabel and not labelSynced → addLabel sequentially; tally synced/failed (`{ issueKey, error: message }`). Works regardless of session.syncLabels flag (explicit user action).
- **getResults(id)**: groups in category position order — `{ category, items: [{ issue, note, decidedAt }] (by seq), jql }` where `jql` = `key in (A-1, A-2)` or `''` if empty. `skipped` = issues with skipped decisions.
- **resultsCsv(id)**: header `key,summary,category,status,priority,assignee,note,decided_at,url`; one row per decided issue in category/seq order. RFC 4180 quoting (quote fields containing `,` `"` or newline; double inner quotes). Also guard against CSV formula injection: prefix a `'` to any field starting with `=`, `+`, `-`, `@`. Line ending `\n`.

## Tests (`test/triage.test.js`)
Use `openDb(':memory:')` and `createMockJiraClient()` (fixture has 40 issues; use `LIMIT=10` JQL to keep small).
1. createSession validation errors (empty name, duplicate hotkey, reserved hotkey).
2. createSession loads issues; search failure deletes session (use a jira stub whose search rejects).
3. decide without sync → no Jira calls; queue shrinks; counts update.
4. decide with syncLabels true + jiraLabel → mock `calls` has add; decision labelSynced true.
5. addLabel failure (stub) → decision saved, warning present, labelSynced false; syncLabels later retries and succeeds with a working client.
6. undo removes the last decision and removes the label if synced; undo with nothing → issueKey null.
7. skip moves issue to end of queue; deciding it later removes it.
8. reopen specific key; reopen unknown → NotFoundError.
9. Changing decision via reopen+decide from labelled category to another labelled category ends with only the new label on the mock issue.
10. getResults groups + jql string; resultsCsv quoting and formula-injection guard (craft an issue summary like `=HYPERLINK("x")`, and one with a comma and quote).

## Done when
`npx vitest run test/triage.test.js` and `npx eslint server/triage.js test/triage.test.js` pass.
