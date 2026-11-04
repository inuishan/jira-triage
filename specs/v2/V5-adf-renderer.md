# V5 — ADF renderer (web/src/AdfRenderer.jsx)

**Wave:** 1 · **Model:** sonnet
**Owns:** `web/src/AdfRenderer.jsx`, `web/src/AdfRenderer.css`, `test/adf-renderer.test.jsx`

Read `specs/00-contracts.md` then `specs/v2/00-contracts-v2.md` first.

## Goal
Render Atlassian Document Format into React elements so descriptions/comments look like they do in Jira. **No `dangerouslySetInnerHTML`, no HTML string building.** Unknown node types render their `content` children (or nothing). Must never throw on malformed input (null content, missing attrs) — wrap per-node rendering defensively.

## Node coverage
| ADF node | Render |
|---|---|
| doc | `<div className="adf">` children |
| paragraph | `<p>`; empty paragraph → `<p>` with `&nbsp;`-like min-height via CSS |
| text | apply marks in order: strong→`<strong>`, em→`<em>`, underline→`<u>`, strike→`<s>`, code→`<code>`, subsup→`<sub>/<sup>`, textColor→`<span style={{color}}>` only if color matches `/^#[0-9a-f]{3,8}$/i`, link→`<a>` (see links) |
| hardBreak | `<br/>` |
| heading | `h1`–`h6` from `attrs.level` (clamp 1–6) |
| bulletList / orderedList / listItem | `ul` / `ol start={attrs.order}` / `li` |
| codeBlock | `<pre className="adf-code"><code>` text, with small language label if `attrs.language` |
| blockquote, rule | `<blockquote>`, `<hr/>` |
| panel | `<div className={`adf-panel adf-panel-${panelType}`}>` (info, note, warning, error, success; default info) |
| table/tableRow/tableHeader/tableCell | `<div className="adf-table-wrap"><table>` with `<tbody>`, `th`/`td` with `colSpan`/`rowSpan` from attrs |
| mention | `<span className="adf-mention">@{attrs.text without leading @}</span>` |
| emoji | `attrs.text` or `attrs.shortName` |
| date | `attrs.timestamp` (ms string) → `toLocaleDateString()` in `<span className="adf-date">` |
| status | `<span className="adf-status adf-status-{attrs.color}">{attrs.text}</span>` |
| inlineCard / blockCard / embedCard | link to `attrs.url` (see links) |
| mediaSingle / mediaGroup / media / mediaInline | find attachment where `filename === attrs.alt` (or `attrs.alt` missing → none). If found & `thumbnailUrl` → `<a href={contentUrl} target="_blank" rel="noreferrer"><img className="adf-media" src={thumbnailUrl} alt={filename}/></a>`; found non-image → attachment chip link `📎 filename`; not found → chip `📎 {attrs.alt || 'attachment'}` (no link) |
| expand / nestedExpand | `<details><summary>{attrs.title || 'Details'}</summary>` children |
| taskList / taskItem | `ul.adf-tasks` / `li` with disabled checkbox checked when `attrs.state === 'DONE'` |
| decisionList / decisionItem | `ul.adf-decisions` / `li` with ✔ prefix |
| placeholder | nothing |

## Links (security + Jira keys)
- Only allow `href` with protocol `http:`, `https:`, `mailto:` (parse with `new URL(href)` in try/catch). Otherwise render plain text (no anchor).
- External anchors: `target="_blank" rel="noreferrer noopener"`.
- If URL path matches `/browse/([A-Z][A-Z0-9_]+-\d+)` → render anchor text as the key when the link text equals the URL (cards), and onClick: `e.preventDefault(); onIssueKeyClick?.(key)` — let parent decide.

## FieldValue (named export)
`FieldValue({ value, attachments, onIssueKeyClick })`: string → `<span>{value}</span>`; `{ adf }` → `<AdfRenderer doc={value.adf} …/>`; anything else → null.

## CSS (`AdfRenderer.css`)
Readable Jira-like typography using vars from styles.css: paragraphs spacing, lists indent, `code` inline pill, `pre` block with bg-alt and horizontal scroll, tables bordered with header bg, panels colored left border + tinted bg (info blue, note purple, warning amber, error red, success green), mention pill (blue tint), status lozenge (uppercase small, colors: neutral, purple, blue, red, yellow, green), media max-width 100% max-height 360px, rounded, border.

## Tests `test/adf-renderer.test.jsx` (renderToStaticMarkup)
1. Paragraph with strong/em/code marks → expected tags.
2. Lists (ordered start=3), heading level 2, codeBlock with language.
3. Table renders th/td with colspan.
4. Link with `javascript:alert(1)` → no `href` containing javascript; https link has rel noreferrer.
5. Text containing `<script>alert(1)</script>` is escaped (markup contains `&lt;script&gt;`).
6. Media node with alt matching an image attachment → `<img` with thumbnail URL; non-matching → chip text.
7. Unknown node type with text children still renders the text; `doc=null` renders nothing; malformed node (content: null) doesn't throw.
8. FieldValue string and adf.

## Done when
`npx vitest run test/adf-renderer.test.jsx` and `npx eslint web/src/AdfRenderer.jsx test/adf-renderer.test.jsx` pass.
