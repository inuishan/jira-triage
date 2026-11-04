# V9 — Triage page orchestrator (web/src/Triage.jsx)

**Wave:** 1 · **Model:** sonnet
**Owns:** `web/src/Triage.jsx` (rewrite), `web/src/Triage.css` (new), `web/src/api.js` (add 3 functions only), `web/src/triageNav.js` (new), `test/triage-nav.test.js`; delete `web/src/Card.jsx` (no longer used — use `/bin/rm`).

Read `specs/00-contracts.md`, `specs/v2/00-contracts-v2.md`, and the current `web/src/Triage.jsx` (keep its working behaviors: decide/skip/undo/note/help/sync-label toggle with confirm/refresh/toasts/hotkeys) first. Components `Sidebar`, `StatsPanel`, `IssueDetail` are written in parallel — import and use them exactly per their prop contracts.

## api.js
Add `listIssues(id)`, `getIssueDetail(id, key, { refresh } = {})` (`?refresh=1` when true; encode key), `getStats(id)` following the file's existing helper.

## `web/src/triageNav.js` (pure, tested)
```js
export function initialKey(issues, savedKey)
// savedKey if present in issues; else first with decision === null; else first skipped; else first issue; else null
export function nextKeyAfter(issues, currentKey)
// next issue AFTER current (list order) with decision === null, wrapping to the start; if none, first skipped issue whose key !== currentKey; else currentKey
export function stepKey(list, currentKey, delta)
// for j/k over the (filtered) list: index of current ± delta clamped; if current not in list → list[0]?.key ?? currentKey
export function upcomingUndecided(issues, currentKey, n = 2)
// next n undecided keys after current (wrapping, excluding current) — for prefetch
```

## Page layout (Triage.css, classes prefixed `tri-`)
```
┌ .tri-topbar ─────────────────────────────────────────────────────────────────────────┐
│ ← Sessions │ Session name (ellipsis) │ <StatsPanel compact/> │ Metrics · Refresh · Results · [☐ Write labels to Jira] │
├ .tri-body (grid: 340px | 1fr, height: calc(100vh - topbar)) ────────────────────────┤
│ <Sidebar/> (border-right)  │ .tri-main (flex column)                                    │
│                            │   .tri-scroll (overflow:auto, flex:1)  <IssueDetail/>      │
│                            │   .tri-actionbar (sticky bottom, border-top, bg)          │
└──────────────────────────────────────────────────────────────────────────────────────┘
```
- Under 900px: sidebar collapses behind a "☰ Issues" toggle button in the topbar (overlay drawer).
- **Action bar**: left: current decision status line (`Decided: ● Accept · 5m ago` / `Skipped` / `Undecided`, plus `📝 note` if note). Center: one button per category (color dot from `categoryColor`, `.kbd` hotkey; the button matching the current decision is visually "active"), Skip (s), Clear (⌫, only when decided/skipped → `api.reopen`). Right: Undo (u), Note (n), Open in Jira (o), Help (?).
- **Metrics** button opens a right-side drawer (`.tri-drawer`, 640px, overlay, Escape/backdrop closes) containing `<StatsPanel stats categories compact={false}/>`.

## State & data flow
- On mount (parallel): `getSession`, `listIssues`, `getStats`.
- `currentKey`: `initialKey(issues, localStorage['triage:'+id+':key'])`; persist to localStorage on change.
- `filter` ('undecided' default), `search` — passed to Sidebar. If current issue is not in filtered list it's still shown in the main view (don't force-change selection).
- **Details**: `detailCache = useRef(new Map())`. When `currentKey` changes: if cached show immediately; otherwise set loading and `api.getIssueDetail`. Ignore responses for keys that are no longer current. Then prefetch `upcomingUndecided(issues, currentKey, 2)` details into the cache (fire-and-forget, errors ignored). `onRefresh` → fetch with `{ refresh: true }` and replace cache entry.
- `onIssueKeyClick(key)`: if key in `issues` → `setCurrentKey(key)`; else `window.open(`${jiraBase}/browse/${key}`, '_blank', 'noopener')` where jiraBase comes from the current issue's `url` (strip `/browse/...`).
- **decide(category)**: busy guard → `api.decide(id, { issueKey: currentKey, categoryId, note })` → patch that item's `decision` in `issues` from `response.decision` (`{status, categoryId, note, decidedAt}`), set session, clear note, toast (`warning` → error toast), refetch stats (don't await), then `setCurrentKey(nextKeyAfter(updatedIssues, currentKey))`. Deciding an already-decided issue changes its decision (server supports it).
- **skip**: `api.skip` → patch decision → next.
- **clear**: `api.reopen(id, currentKey)` → decision null, stay on the issue, refetch stats.
- **undo**: `api.undo` → if `issueKey` null toast "Nothing to undo"; else reload `listIssues` + stats and `setCurrentKey(issueKey)`.
- **refresh** (Jira re-query): `api.refresh` → reload issues + stats, toast `N new`.
- Note modal: prefill with the current issue's existing note when opened.

## Hotkeys (useHotkeys; disabled while busy except navigation; Escape closes modals/drawer)
Category hotkeys first (they win on conflicts), then: `ArrowRight` first non-reject category, `ArrowLeft` reject, `s` skip, `Backspace` clear, `u`/`mod+z` undo, `j`/`k` next/prev in `filterIssues(issues, filter, search)` (import from Sidebar.jsx) via `stepKey`, `/` focus sidebar search (preventDefault), `n` note, `o` open in Jira, `m` metrics drawer, `?` help, `e` no longer needed (remove). Update the help overlay table accordingly and add a line "Category hotkeys override these if they clash."

## Tests `test/triage-nav.test.js`
Table-driven tests for all four triageNav functions (wrapping, all decided, skipped fallback, savedKey missing, filtered list not containing current).

## Done when
`npx vitest run test/triage-nav.test.js` and `npx eslint web/src/Triage.jsx web/src/triageNav.js web/src/api.js test/triage-nav.test.js` pass; `Card.jsx` deleted; no `dangerouslySetInnerHTML`.
