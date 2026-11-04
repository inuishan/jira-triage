# T3 — Jira client, mock client, fixture

**Wave:** 1 · **Depends on:** contracts only · **Suggested model:** sonnet
**Owns:** `server/jira.js`, `test/jira.test.js`, `test/fixtures/issues.json`

## Goal
Implement every export listed under "T3 — server/jira.js exports" in `specs/00-contracts.md`.

## Real client
- Auth header: `Authorization: Basic base64(email:apiToken)`, plus `Accept: application/json`, `Content-Type: application/json`.
- Strip trailing `/` from baseUrl.
- `search(jql)`: `POST {baseUrl}/rest/api/3/search/jql` body `{ jql, fields: SEARCH_FIELDS, maxResults: 100, nextPageToken? }`. Loop while response has `nextPageToken` and `isLast !== true`. Collect `issues`, map through `normalizeIssue`. Safety cap: stop after 50 pages (5000 issues) and throw `Error('Too many results (>5000); narrow your JQL')`.
- `SEARCH_FIELDS = ['summary','status','priority','assignee','reporter','issuetype','labels','components','created','updated','description']`.
- `addLabel(key, label)`: `PUT {baseUrl}/rest/api/3/issue/{encodeURIComponent(key)}` body `{ update: { labels: [{ add: label }] } }`. Expect 204. `removeLabel` same with `remove`.
- Error handling per contracts: try to parse JSON body; message = `errorMessages[0]` or first value of `errors` object or `statusText`. Attach `err.status`. Never include the token or auth header in messages.

## adfToText(adf)
- null/undefined → `''`; string → itself.
- Recursive walk of ADF nodes: `text` nodes → their `text`; `hardBreak` → `\n`; `mention` → `attrs.text`; `emoji` → `attrs.shortName`; `inlineCard` → `attrs.url`.
- Block nodes (`paragraph`, `heading`, `blockquote`, `codeBlock`, `listItem`, `rule`, `panel`, `tableRow`) end with `\n`. `listItem` prefix `- `. `tableCell`/`tableHeader` joined with ` | `.
- Collapse 3+ newlines to 2, trim result.

## normalizeIssue(raw, baseUrl)
Map to the Normalized Issue shape exactly. Missing nested fields → null / [] / ''. `url = ${baseUrl}/browse/${key}`.

## Mock client
- `createMockJiraClient({ issues, baseUrl })`: `issues` defaults to the parsed fixture (load with `readFileSync(new URL('../test/fixtures/issues.json', import.meta.url))`). Keeps raw issues in memory; `search()` ignores JQL except: if JQL contains `LIMIT=<n>` (a mock-only convenience) return first n. Returns normalized issues. `addLabel/removeLabel` mutate in-memory labels and push `{ op, key, label }` to `calls`. Unknown key → throw Error with `status: 404`. Simulate ~150ms latency on search via `setTimeout` only when `process.env.NODE_ENV !== 'test'` and `!process.env.VITEST`.
- `createJiraFromEnv(env)`: `env.JIRA_MOCK === '1'` → mock. Else require `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`; if missing throw `Error('Missing Jira config: set JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN in .env (or JIRA_MOCK=1)')`.

## Fixture `test/fixtures/issues.json`
JSON array of **40** raw Jira v3 issues (`{ key, fields }`) for a fake project `DEMO` (keys DEMO-101..DEMO-140). Realistic but clearly fake security-software backlog items (e.g. "Badge reader sync drops events after reconnect", "Add SSO audit log export"). Vary: issuetype (Bug/Story/Task/Epic), status (To Do/In Progress/Blocked/Done), priority (Highest..Lowest, some null), assignee (some null; fake names), labels (0–3), components (0–2), created/updated ISO dates in 2026, description as ADF with paragraphs, some bullet lists, a few null. No real people, customers, or company data. Generating it with a throwaway Node script is fine; don't commit the script.

## Tests (`test/jira.test.js`)
1. adfToText: paragraphs, bullet list, hardBreak, mention, null → ''.
2. normalizeIssue: full and sparse (missing assignee/priority/description) issues.
3. search pagination: fake `fetchImpl` returns 3 pages (tokens 'p2','p3', last has `isLast: true`); assert 3 calls, correct bodies (nextPageToken forwarded), combined order, auth header present.
4. Error mapping: 400 with `{ errorMessages: ['Bad JQL'] }` → throws `Jira 400: Bad JQL` with `.status === 400`; ensure message doesn't contain the token.
5. addLabel sends correct PUT URL/body.
6. Mock client: search returns 40 normalized; `LIMIT=5` returns 5; addLabel mutates and records call; unknown key → 404.
7. createJiraFromEnv: missing vars throws; JIRA_MOCK=1 returns mock.

## Done when
`npx vitest run test/jira.test.js` and `npx eslint server/jira.js test/jira.test.js` pass.
