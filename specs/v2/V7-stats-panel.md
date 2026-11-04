# V7 — Metrics (web/src/StatsPanel.jsx)

**Wave:** 1 · **Model:** haiku
**Owns:** `web/src/StatsPanel.jsx`, `web/src/StatsPanel.css`

Read `specs/00-contracts.md` then `specs/v2/00-contracts-v2.md` (Stats shape, StatsPanel props, Category colors) first. Import `categoryColor` from `./Sidebar.jsx` (being written in parallel — code against the contract).

## `stats === null`
Render a muted "Loading metrics…" (compact: nothing).

## Compact (`compact={true}`) — one row for the top bar
- **Stacked progress bar** (flex, ~240px wide, 8px tall, rounded): one segment per category (width = count/total, color = categoryColor), then skipped (grey), rest empty track. `title` tooltip on each segment `Accept: 20`.
- Text: `**42**/159 decided` · then per-category `● Accept 20` items (dot colored) · `Skipped 3` · `Left 117`.
- Pace (muted): `~25s/ticket · ETA 48m · 12 today` (omit parts that are null; ETA ≥ 60 min → `1h 5m`).
- Must not wrap awkwardly: `white-space: nowrap; overflow: hidden; text-overflow: ellipsis` on the text group.

## Full (`compact={false}`) — content of a metrics drawer
- **Tiles** row: Total, Decided (with %), Undecided, Skipped, each category (colored top border), Today, ETA.
- **Breakdown** sections: Priority, Type, Status, Assignee. Each a `.table`:
  columns `Value | Total | Undecided | <one column per category> | bar`, where bar = mini stacked bar (category segments + undecided grey) proportional to row total. Numbers right-aligned, 0 shown as `·` muted.
- Section headers small uppercase muted.

## CSS
Scoped class names prefixed `stats-`. Use styles.css variables. Tiles as a responsive grid (`repeat(auto-fill, minmax(120px, 1fr))`).

## Done when
`npx eslint web/src/StatsPanel.jsx` passes.
