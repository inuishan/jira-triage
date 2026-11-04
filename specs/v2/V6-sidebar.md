# V6 — Issue sidebar (web/src/Sidebar.jsx)

**Wave:** 1 · **Model:** haiku
**Owns:** `web/src/Sidebar.jsx`, `web/src/Sidebar.css`, `test/sidebar.test.js`

Read `specs/00-contracts.md` then `specs/v2/00-contracts-v2.md` (Sidebar + Category colors) first.

## Exports
- default `Sidebar(props)` — props exactly per contract.
- `filterIssues(issues, filter, search)` — pure:
  - filter `'all'` → all; `'undecided'` → `decision === null`; `'skipped'` → `decision?.status === 'skipped'`; `'cat:<id>'` → decided with that categoryId.
  - search: trim, case-insensitive substring over `key`, `summary`, `assignee`; empty → no filtering.
  - keeps input order.
- `categoryColor(category, categories)` per contract color convention.

## Layout
`<aside className="sidebar">`, full height, own scroll:
1. **Search** `<input ref={searchInputRef} className="sidebar-search" placeholder="Search key, summary, assignee   ( / )">`; Escape inside it blurs the input.
2. **Filter chips** (wrap): `All n`, `Undecided n`, one per category `Name n` (dot in category color), `Skipped n`. Active chip highlighted. Counts computed from `issues` (not filtered by search).
3. Result count line: `Showing 37 of 159` (muted, small).
4. **List** `<ul className="sidebar-list">` of `<li>` buttons (`role="button"`, `tabIndex=0`, Enter/Space selects):
   - left 4px bar in category color (decided) / grey dashed (skipped) / transparent (undecided)
   - line 1: key (monospace, small) · priority text · tiny type text
   - line 2: summary, 2-line clamp
   - line 3 (muted, small): status · assignee or "Unassigned" · decision label right-aligned (category name or "Skipped")
   - `aria-current="true"` + highlighted background for `currentKey`
   - When `currentKey` changes, scroll that item into view (`scrollIntoView({ block: 'nearest' })`) via a ref map in `useEffect`.
5. Empty → `.sidebar-empty` "No issues match".

## CSS
Width is set by parent grid; make sidebar `display:flex; flex-direction:column; min-height:0; height:100%`, list `overflow-y:auto; flex:1`. Compact density (≈64px rows). Hover state, focus-visible outline. Use styles.css variables.

## Tests `test/sidebar.test.js` (pure functions only)
filterIssues for each filter + search on key/summary/assignee + combination; categoryColor for reject, index-based, wraparound.

## Done when
`npx vitest run test/sidebar.test.js` and `npx eslint web/src/Sidebar.jsx test/sidebar.test.js` pass.
