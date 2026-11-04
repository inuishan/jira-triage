# Specs — execution order

Read `00-contracts.md` first. Each task lists the files it **owns**; tasks never touch each other's files.

| Wave | Task | Files | Model |
|---|---|---|---|
| 1 | T2 DB layer | server/db.js, test/db.test.js | sonnet |
| 1 | T3 Jira client + fixture | server/jira.js, test/jira.test.js, test/fixtures/issues.json | sonnet |
| 1 | T4 Web foundation | web/src/api.js, useHotkeys.js, styles.css | haiku |
| 1 | T6 HTTP server | server/routes.js, server/index.js, test/routes.test.js | sonnet |
| 1 | T7 Home UI | web/src/Home.jsx | haiku |
| 1 | T8 Triage UI | web/src/Triage.jsx, Card.jsx | sonnet |
| 1 | T9 App + Results UI | web/src/App.jsx, Results.jsx | haiku |
| 2 | T5 Triage service | server/triage.js, test/triage.test.js | sonnet |
| 3 | Integration (orchestrator) | full `npm test`, `npm run lint`, `npm run build`, mock-mode browser walkthrough | opus |

T1 (tooling: package.json, vite/eslint config, index.html, main.jsx, scripts/dev.js) is already done.
