# V4 — Service methods for v2 (server/triage.js)

**Wave:** 2 (needs V1 + V2) · **Model:** sonnet
**Owns:** `server/triage.js` (add only), `test/triage-v2.test.js`

Read `specs/00-contracts.md` then `specs/v2/00-contracts-v2.md` (section V4) first. Implement `listIssues`, `getIssueDetail`, `getStats`, `getAttachment` exactly as specified there, using the new db.js and jira.js exports. Follow existing style in triage.js (requireSession etc.).

Details:
- Cache freshness: `Date.now() - Date.parse(cached.fetchedAt) < 10 * 60 * 1000`.
- On Jira failure with cache → `{ ...cached, stale: true }`; without cache → rethrow.
- `getAttachment`: validate id, delegate to `jira.getAttachment`.

## Tests `test/triage-v2.test.js` (openDb(':memory:'), createMockJiraClient, `LIMIT=10` JQL)
1. listIssues reflects decide/skip.
2. getIssueDetail: first call hits jira (wrap mock `getIssueDetail` in a `vi.fn` spy), second call within 10 min uses cache, `refresh: true` refetches; key not in session → NotFoundError.
3. Stale fallback: cached entry with old fetchedAt + jira throwing → returns `stale: true`; no cache + throwing → rejects.
4. getStats shape sanity after a few decisions.
5. getAttachment invalid id → ValidationError; valid mock id returns image/png.

## Done when
`npx vitest run test/triage-v2.test.js test/triage.test.js` and `npx eslint server/triage.js test/triage-v2.test.js` pass.
