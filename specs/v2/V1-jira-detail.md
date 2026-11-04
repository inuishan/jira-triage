# V1 — Jira issue detail + attachments (server/jira.js)

**Wave:** 1 · **Model:** sonnet
**Owns:** `server/jira.js` (add only — keep every existing export/behavior), `test/jira-detail.test.js`, `test/fixtures/issue-detail.json`

Read `specs/00-contracts.md` then `specs/v2/00-contracts-v2.md` first.

## Real client: `getIssueDetail(key)`
1. `GET {base}/rest/api/3/issue/{encodeURIComponent(key)}?fields=*all&expand=names` → raw (has `key`, `fields`, `names` = map fieldId→display name).
2. Comments: `raw.fields.comment` = `{ comments, total }`. If `total > comments.length`, page through `GET {base}/rest/api/3/issue/{key}/comment?startAt=<n>&maxResults=100&orderBy=created` until all collected (cap 500 → stop silently). Replace `raw.fields.comment.comments` with the full list.
3. Return `normalizeIssueDetail(raw, base)`. Errors via existing `throwJiraError`.

## Real client: `getAttachment(id, { thumbnail = false })`
- Content: `GET {base}/rest/api/3/attachment/content/{id}?redirect=false`
- Thumbnail: `GET {base}/rest/api/3/attachment/thumbnail/{id}?redirect=false&fallbackToDefault=false`
- Use auth header but **override** `Accept: '*/*'`. Non-2xx → `throwJiraError`.
- Return `{ body: res.body (web ReadableStream), contentType: res.headers.get('content-type') || 'application/octet-stream', contentLength: Number(header) || null }`.

## `normalizeIssueDetail(raw, baseUrl)`
Map to `IssueDetail` exactly (contracts v2). Rules:
- Person from `{ displayName, accountId }` objects; null-safe.
- `statusCategory` = `fields.status.statusCategory.key` if in `new|indeterminate|done`, else null.
- `resolution` = `fields.resolution?.name`; `resolved` = `fields.resolutiondate`; `dueDate` = `fields.duedate`.
- `fixVersions`/`affectsVersions` (`fields.versions`) → names.
- IssueRef from an embedded issue `{ key, fields: { summary, status:{name,statusCategory:{key}}, priority:{name}, issuetype:{name} } }`; url = `${baseUrl}/browse/${key}`.
- `links` from `fields.issuelinks`: if `outwardIssue` → label `type.outward`, issue = outwardIssue; if `inwardIssue` → label `type.inward`. `id` = link id.
- `descriptionAdf`/`environmentAdf`: the ADF object if `type === 'doc'`, else if a non-empty string wrap as `{type:'doc',version:1,content:[{type:'paragraph',content:[{type:'text',text}]}]}`, else null.
- `timeTracking`: `fields.timetracking` with any of the three keys present → object (missing ones null), else null.
- `attachments`: from `fields.attachment`; `id` as string; `contentUrl`/`thumbnailUrl` are OUR proxy paths per contract (never Jira URLs).
- `comments`: `{ id, author, created, updated, bodyAdf: body if ADF doc else null }`, sorted by created ascending. `commentTotal` = `fields.comment.total ?? comments.length`.
- `customFields`: every `fields` key starting `customfield_` whose `customFieldToDisplay(value)` is non-null; `name` = `raw.names?.[id] ?? id`; sorted by name (localeCompare). Skip field names that duplicate first-class data: names matching /^(Rank|Development|Team Name|\[CHART\].*)$/i... keep it to exactly: `Rank`, `Development`. Skip values that look like internal JSON strings starting with `{` (Jira's dev-panel fields).
- `fetchedAt` = `new Date().toISOString()`.

## `customFieldToDisplay(raw)`
- `null`/`undefined`/`''`/empty array → `null`.
- string/number/boolean → `String(raw)`.
- ADF doc (`raw.type === 'doc'`) → `{ adf: raw }`.
- Array → map items through the object/primitive rules to strings, drop empties, join `', '`; empty → null.
- Object → first present of `displayName`, `value` (+ `' / ' + child.value` if `child`), `name` (if it also has `state`, e.g. sprint: `` `${name} (${state.toLowerCase()})` ``), `key`; else `null`.

## Mock client
- `getIssueDetail(key)`: unknown key → 404 error (same as label ops). Load `test/fixtures/issue-detail.json` (a raw GET-issue response template incl. `names`), deep-clone it, then overwrite `key` and the base fields (summary, status, priority, issuetype, assignee, reporter, labels, components, created, updated, description) from the matching raw fixture issue in `issues.json`. Return normalized. Same latency rule as search.
- `getAttachment(id)`: return a tiny valid PNG (1×1, embed base64 constant) as `Buffer` with `contentType: 'image/png'` for ids present in the template's attachments; else 404 error.

## Fixture `test/fixtures/issue-detail.json`
One realistic raw Jira Cloud `GET /rest/api/3/issue/DEMO-101?expand=names` response (fake data) containing:
- description ADF with heading, paragraphs with **strong**/*em*/`code`/link marks, bulletList, orderedList, codeBlock (language js), a table (2×3), a panel (info), a mention, an emoji, an inlineCard, and a `mediaSingle > media` node with `attrs: { type:'file', id:'uuid…', alt:'screenshot.png' }`.
- environment string, resolution null, duedate, fixVersions (1), versions (1), timetracking.
- parent (an Epic DEMO-100), 2 subtasks, 3 issuelinks (blocks / is blocked by / relates to).
- 2 attachments: `screenshot.png` (image/png, id "10001") and `logs.txt` (text/plain, id "10002").
- comment: total 3, 3 comments with ADF bodies (one with a mention + code).
- customfields: Sprint (array of sprint objects with name/state), Story Points (number), Team (object with value? use `{ value: 'Platform' }`), Epic Link-style string, a select-with-child `{value:'Web', child:{value:'Dashboard'}}`, a multi-user array, a `Rank` string (must be skipped), an empty one (null) (skipped), a `Development` string `'{}'` (skipped).
- `names` map for all customfields.

## Tests `test/jira-detail.test.js`
1. customFieldToDisplay table-driven: null/''/[]→null, number, sprint array, select w/ child, users array, ADF.
2. normalizeIssueDetail on the fixture: links labels/direction, subtasks, parent, attachments proxy URLs + thumbnailUrl only for image, comments ordered, customFields sorted & Rank/Development/null skipped, string environment wrapped as ADF.
3. Real client getIssueDetail with fake fetch: first call returns fixture with `comment.total = 150` and 3 comments; then 2 comment pages; assert URLs (`expand=names`, `startAt`), merged comment count, auth header.
4. getAttachment: correct URLs (content vs thumbnail, `redirect=false`), returns contentType/body; 404 → throws with status.
5. Mock: getIssueDetail('DEMO-105') has DEMO-105 summary but template comments; unknown → 404; getAttachment('10001') returns PNG buffer.

## Done when
`npx vitest run test/jira-detail.test.js test/jira.test.js` and `npx eslint server/jira.js test/jira-detail.test.js` pass.
