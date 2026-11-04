# T7 — UI: Home (session list + new session)

**Wave:** 1 · **Depends on:** contracts (api.js + CSS vocabulary; code against the contract even if T4 hasn't landed) · **Suggested model:** haiku
**Owns:** `web/src/Home.jsx`

## Behavior
Default export `Home()` (no props).
- On mount: `api.health()` and `api.listSessions()`. Show a small banner `Mock Jira mode` (class `muted`) when `health.mock`.
- **Session list** (`.session-list` / `.session-item`): name, JQL (monospace, truncated with ellipsis), created date (locale date), progress `decided / total` with `.progress`/`.progress-bar`, and `skipped` count if > 0. Buttons: **Continue** (→ `#/s/:id`, `.btn-primary`), **Results** (→ `#/s/:id/results`), **Delete** (`.btn-ghost`, `window.confirm('Delete session "<name>"? Local decisions will be lost. Jira is not changed.')` then `api.deleteSession` and reload list). Empty state `.empty`: "No triage sessions yet."
- **New session form** (toggle with a `+ New session` button; open by default when there are no sessions):
  - Name (text, required), JQL (textarea, required, monospace, placeholder `project = ABC AND statusCategory != Done ORDER BY priority DESC`).
  - Categories editor: rows of `{ name, jiraLabel, hotkey, isReject }` prefilled with the two defaults (`Accept/a`, `Reject/r` isReject). Inputs: name text, Jira label text (placeholder "optional label to add in Jira"), hotkey (maxLength 1), Reject checkbox. "Add category" adds `{name:'', jiraLabel:'', hotkey: next unused of '1'..'9', isReject:false}`; remove button per row (keep at least 1).
  - Helper text under categories (class `muted`): "Decisions are stored locally. Jira labels are only written if you turn on label sync inside the session."
  - Submit: disable button & show "Fetching issues…" while pending; on success navigate to `#/s/<id>`; on error show message in `.toast.toast-error` (or inline error text).
- Keep state with `useState`; no external libs.

## Done when
`npx eslint web/src/Home.jsx` passes and the component only uses functions defined in the api.js contract.
