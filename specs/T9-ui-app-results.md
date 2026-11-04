# T9 — UI: App router + Results

**Wave:** 1 · **Depends on:** contracts · **Suggested model:** haiku
**Owns:** `web/src/App.jsx`, `web/src/Results.jsx`

## App.jsx
Default export `App()`. Tiny hash router: state from `location.hash`, update on `hashchange`. Routes per contracts "UI routing". Unknown → Home. Wrap in `<div className="app">`. Sessions ids parsed with `Number`.

## Results.jsx
Default export `Results({ sessionId })`.
- Load `api.getResults(id)`. Topbar: "← Back to triage" (`#/s/:id`), "Sessions" (`#/`), title `{session.name} — results`.
- `.tabs`: one `.tab` per group (`{category.name} (count)`) + "Skipped (n)". Default to first group.
- Selected group view:
  - Buttons: **Copy JQL** (navigator.clipboard.writeText(group.jql); disabled if empty; toast "Copied"), **Download CSV** (`<a className="btn" href={api.resultsCsvUrl(id)}>`), **Sync labels to Jira** — only shown if any category has a `jiraLabel`; `window.confirm('Add labels in Jira for all decided tickets not yet synced?')` → `api.syncLabels(id)` → toast `Synced N, failed M` (list failures in toast-error).
  - `.table`: Key (link to url, target _blank, rel noreferrer), Summary, Status, Priority, Note, Decided at (locale string), action **Reopen** (`.btn-ghost`) → `api.reopen(id, key)` then reload results; toast "Reopened KEY — it's back in the queue".
  - Skipped tab: same table without Note/Decided; no reopen.
- Empty group → `.empty` "Nothing here yet."
- Text only — no `dangerouslySetInnerHTML`.

## Done when
`npx eslint web/src/App.jsx web/src/Results.jsx` passes.
