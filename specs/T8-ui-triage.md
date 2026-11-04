# T8 — UI: Triage view + Card

**Wave:** 1 · **Depends on:** contracts (api.js, useHotkeys, CSS vocabulary) · **Suggested model:** sonnet
**Owns:** `web/src/Triage.jsx`, `web/src/Card.jsx`

## Card.jsx
Default export `Card({ issue, expanded, onToggleExpand })`. Pure presentational.
- `.card` > `.card-header`: `<a class="card-key" href={issue.url} target="_blank" rel="noreferrer">{key}</a>` and `.chips` with chips for type, status, priority (`data-kind`). Skip null values.
- `.card-summary`: summary.
- `.meta` grid: Assignee (or "Unassigned"), Reporter, Created, Updated (locale date), Components (comma list or "—").
- Labels as `.chip[data-kind=label]` row (only if any).
- `.description` (+`expanded` class) rendered as plain text (NEVER `dangerouslySetInnerHTML`). If description longer than ~600 chars show a "Show more / Show less" `.btn-ghost` calling `onToggleExpand`. Empty → `.muted` "No description".

## Triage.jsx
Default export `Triage({ sessionId })`.
State: `session` (with categories), `queue` (Issue[]), `index` = always 0 (front of queue), `busy`, `toast` ({ text, error }), `expanded`, `noteOpen`, `note`, `helpOpen`.

Load: `api.getSession(id)` + `api.getQueue(id)` in parallel. Show `.empty` loading/error states.

**Topbar** (`.topbar`): "← Sessions" link (`#/`), session name, progress text `decided / total decided · remaining N` + `.progress`, toggle checkbox **Write labels to Jira** bound to `session.syncLabels` → `api.updateSession(id, { syncLabels })`. When turning ON show `window.confirm('This will add Jira labels to tickets as you decide. Continue?')`. Links: **Refresh** (`api.refresh` → reload queue, toast "N new issues"), **Results** (`#/s/:id/results`).

**Current card** = `queue[0]`. If queue empty: `.empty` "All done 🎉 — N decided" with buttons to Results and Refresh.

**Actions** (`.actions`), one button per category in position order: label `{name}` + `.kbd` hotkey; Reject category `.btn-danger`, first non-reject `.btn-primary`, others plain `.btn`. Extra buttons: Skip (`s`), Undo (`u`), Note (`n`), Open in Jira (`o`), Help (`?`).

**Hotkeys** via `useHotkeys` (disabled while `busy` or note modal open, except Escape):
- each category's hotkey → decide
- `ArrowRight` → first non-reject category; `ArrowLeft` → reject category (if any)
- `s` / `ArrowDown` → skip; `u` / `mod+z` → undo; `o` → `window.open(issue.url, '_blank', 'noopener')`; `n` → open note modal; `?` → toggle help; `Escape` → close modals; `e` → toggle description expand.

**Decide flow** (optimistic, but keep it simple & correct):
1. `busy=true`; call `api.decide(id, { issueKey, categoryId, note })`.
2. On success: remove that issue from `queue`, set `session` counts from response, clear note/expanded. If `warning` → error toast. Else brief toast `"{KEY} → {Category}"` (1.5s).
3. On error: error toast, card stays.
Skip: `api.skip` → move issue from front to end of local queue.
Undo: `api.undo` → if `issueKey` null toast "Nothing to undo"; else reload queue via `api.getQueue` (simplest correct), update session, toast `Undid {key}`. Since undone undecided issues sort by position, after reload make the undone issue the current card: move it to front of the queue if present.

**Note modal** (`.modal-backdrop` > `.modal`): textarea autofocus, "Save note" keeps note in state (sent with next decide); show a small "📝 note attached" indicator on the card area when non-empty. Enter+mod saves.

**Help overlay**: table of shortcuts.

Prefetch isn't needed (whole queue is loaded up front).

## Done when
`npx eslint web/src/Triage.jsx web/src/Card.jsx` passes; uses only api.js/useHotkeys contract functions; no `dangerouslySetInnerHTML`.
