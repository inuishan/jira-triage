# V8 — Jira-like issue view (web/src/IssueDetail.jsx)

**Wave:** 1 · **Model:** sonnet
**Owns:** `web/src/IssueDetail.jsx`, `web/src/IssueDetail.css`

Read `specs/00-contracts.md` then `specs/v2/00-contracts-v2.md` (IssueDetail shape and component props) first. Import `AdfRenderer` (default) and `{ FieldValue }` from `./AdfRenderer.jsx` — written in parallel; code against the contract.

## Goal
Feel like viewing the ticket in Jira: everything important visible without clicking out.

## Layout (`<article className="issue">`)
**Header**
- Breadcrumb line (muted, small): parent (`IssueRef` → type icon text + key link, click → `onIssueKeyClick(parent.key)`) ` / ` current key as external link to `detail.url` (target _blank, rel noreferrer).
- Right side of header: "Updated from Jira 3 min ago" (relative from `fetchedAt`), a `stale` warning badge if `detail.stale` ("Showing cached copy — Jira unavailable"), and a ↻ Refresh button calling `onRefresh`.
- `<h1 className="issue-title">{summary}</h1>`.

**Body: two columns** (`grid-template-columns: minmax(0,1fr) 300px`, gap 32px; single column under 1100px — details column moves to top)

*Main column*, sections with small uppercase headings, each omitted when empty:
1. **Description** — `<AdfRenderer doc={descriptionAdf} attachments onIssueKeyClick>`; empty → muted "No description".
2. **Environment** — AdfRenderer.
3. **Attachments (n)** — grid of tiles: image → thumbnail `<img src={thumbnailUrl}>` (lazy), others → file icon + filename; all link to `contentUrl` (target _blank). Under each: filename (ellipsis), size human-readable (KB/MB), author.
4. **Subtasks (n)** — rows: type · key (click → onIssueKeyClick) · summary · status lozenge · priority.
5. **Linked issues (n)** — grouped by `label` ("blocks", "is blocked by", …); rows same as subtasks.
6. **Comments (commentTotal)** — oldest first; each: avatar circle with initials (deterministic bg color from displayName hash), author name bold, relative time (title = full date; "edited" if updated ≠ created), body via AdfRenderer. If more than 5 comments, show the last 5 and a "Show all N comments" button that expands.

*Details column* (`<aside className="issue-details">`, sticky top within the scroll container):
- Status lozenge colored by `statusCategory` (new → grey, indeterminate → blue, done → green).
- Definition list rows (label left muted, value right): Assignee (initials avatar + name / "Unassigned"), Reporter, Priority, Type, Resolution, Labels (chips), Components, Fix versions, Affects versions, Due date, Time tracking (original / remaining / spent), Created, Updated, Resolved. Omit rows whose value is empty, except Assignee.
- **More fields** collapsible (`<details open>`), rows for every `customFields` entry using `<FieldValue>`.

**Loading / error / fallback**
- `loading && !detail`: show header with `fallback` data (key, summary, chips for type/status/priority/assignee) and skeleton blocks (CSS shimmer) for description and details.
- `error && !detail`: fallback header + error box with message and Retry (`onRefresh`).
- `!detail && !fallback`: `.empty` "Select an issue".

## Helpers (inside the file, not exported unless useful)
`relativeTime(iso)` (just now / Xm / Xh / Xd ago / locale date if > 30d), `formatBytes(n)`, `initials(name)`, `hashColor(name)`.

## CSS
Prefix classes `issue-`. Title ~1.6rem semibold. Sections separated by spacing not heavy borders. Details column: card with border, rows 8px padding, label 40% width. Lozenges: uppercase, 11px, bold, rounded 3px. Make long content wrap (`overflow-wrap:anywhere`) and code/tables scroll horizontally inside their own container, never the page.

## Done when
`npx eslint web/src/IssueDetail.jsx` passes; no `dangerouslySetInnerHTML`.
