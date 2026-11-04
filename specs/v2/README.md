# v2 specs — Jira-like detail, sidebar, metrics

Read `../00-contracts.md` then `00-contracts-v2.md`. Each task owns specific files only.

| Wave | Task | Owns | Model |
|---|---|---|---|
| 1 | V1 Jira issue detail + attachments | server/jira.js (+), test/jira-detail.test.js, test/fixtures/issue-detail.json | sonnet |
| 1 | V2 DB cache, issue list, stats | server/db.js (+), test/db-v2.test.js | sonnet |
| 1 | V3 Routes | server/routes.js (+), test/routes-v2.test.js | haiku |
| 1 | V5 ADF renderer | web/src/AdfRenderer.jsx/.css, test/adf-renderer.test.jsx | sonnet |
| 1 | V6 Sidebar | web/src/Sidebar.jsx/.css, test/sidebar.test.js | haiku |
| 1 | V7 Metrics | web/src/StatsPanel.jsx/.css | haiku |
| 1 | V8 Issue detail view | web/src/IssueDetail.jsx/.css | sonnet |
| 1 | V9 Triage page | web/src/Triage.jsx/.css, triageNav.js, api.js (+), test/triage-nav.test.js, delete Card.jsx | sonnet |
| 2 | V4 Service methods | server/triage.js (+), test/triage-v2.test.js | sonnet |
| 3 | Integration (orchestrator) | config, full test/lint/build, mock walkthrough, then real-Jira read-only check by user | opus |
