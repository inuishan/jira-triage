# T4 — Web foundation: API wrapper, hotkeys hook, styles

**Wave:** 1 · **Depends on:** contracts only · **Suggested model:** haiku
**Owns:** `web/src/api.js`, `web/src/useHotkeys.js`, `web/src/styles.css`

## api.js
Implement every function in contracts "T4 — web/src/api.js". One internal helper:
```js
async function request(method, path, body) // fetch('/api' + path, {method, headers JSON when body, body: JSON.stringify(body)})
// 204 → null. Non-2xx → parse JSON {error} if possible, throw new Error(error || `${res.status} ${res.statusText}`).
```
`resultsCsvUrl(id)` returns `/api/sessions/${id}/results.csv`.

## useHotkeys.js
Implement per contracts. Use `useEffect` + `window.addEventListener('keydown', …)`; keep latest `map` in a ref so the listener isn't re-bound on each render. Key normalization: `e.key.length === 1 ? e.key.toLowerCase() : e.key`. `mod+z` = `(e.ctrlKey || e.metaKey) && key === 'z'`. Skip when `e.repeat`.

## styles.css
Clean, modern, light theme with automatic dark mode (`prefers-color-scheme`), CSS variables at `:root`. System font stack. Define every class in the contracts "CSS class vocabulary". Guidance:
- `.app` full-height column; `.topbar` sticky header, flex, space-between; `.container` max-width 860px centered, padding.
- `.card` large rounded panel (radius 14px, shadow, padding 24px), min-height 360px. `.card-key` monospace link. `.card-summary` ~1.35rem bold. `.chips`/`.chip` small pill tags (chip variants via `data-kind="status|priority|type|label|component"` with subtle different colors). `.meta` small muted grid of label/value pairs. `.description` pre-wrap text, max-height 220px overflow hidden with fade; `.description.expanded` no max-height.
- `.actions` flex wrap gap 10px centered. `.btn` with `.btn-primary` (green-ish accept), `.btn-danger` (red reject), `.btn-ghost`. Buttons show a `.kbd` hint inside.
- `.progress` track + `.progress-bar` fill.
- `.toast` fixed bottom-center, auto width; `.toast-error` red.
- `.modal-backdrop` fixed overlay; `.modal` centered panel max-width 520px.
- `.form-row` label above input; inputs/textarea full width, readable.
- `.session-list`/`.session-item` cards in a list with hover.
- `.tabs`/`.tab`/`.tab.active`, `.table` simple striped table, `.muted`, `.empty` centered muted message.
Keep it under ~250 lines.

## Done when
`npx eslint web/src/api.js web/src/useHotkeys.js` passes. (No unit tests required.)
