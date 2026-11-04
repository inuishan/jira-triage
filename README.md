# Jira Triage

Card-based triage for a JQL result set. Decide each ticket with buttons or keyboard shortcuts. Decisions are stored locally (SQLite), so tickets you have already accepted or rejected do not come back when you resume. Optionally, it writes a Jira label for categories that have one.

## Features

Derived from the code and specs in `specs/`:

- **Sessions:** create a named triage session from a JQL query and a set of categories (default Accept `a` / Reject `r`; add more with hotkeys `1`–`9`).
- **Card triage:** one ticket at a time, with buttons and keyboard shortcuts (see below). Skipping moves a ticket to the end of the queue; undo is available.
- **Persistent progress:** decisions are saved in a local SQLite database. Come back any time and continue.
- **Refresh:** pull newly matching tickets from Jira into the session.
- **Issue detail:** rendered description and comments (Atlassian Document Format), and attachments with thumbnails.
- **Sidebar and stats panel:** per-session progress.
- **Results:** per-category lists, CSV export, copy a `key in (...)` JQL, reopen a decision, or bulk "Sync labels to Jira".
- **Mock mode:** 40 fake tickets for trying the UI without Jira.

### Triage keys

| Key | Action |
|---|---|
| `→` / `a` | Accept |
| `←` / `r` | Reject |
| `1`–`9` | Other categories |
| `s` | Skip (moves to end) |
| `u` | Undo |
| `o` | Open in Jira |
| `n` | Note |
| `e` | Expand description |
| `?` | Help |

## Jira writes

Label writes are **off by default** per session. Turn them on with "Write labels to Jira", or use "Sync labels to Jira" on the results page. Only categories that have a Jira label write anything: rejects never touch Jira unless you give the Reject category a label. Undo and reopen remove a label that the app added.

## Architecture

- **Server** (`server/`): Node.js ESM with Express 5. It exposes a JSON API under `/api/...` and serves the built UI. It uses the built-in `node:sqlite` module for the database and calls the Jira Cloud REST API v3 with Basic auth (email + API token). The API token stays on the server.
- **UI** (`web/`): React 19, built with Vite 8 to `web/dist/`. In development, Vite proxies `/api` to the server.
- **Database:** SQLite file at `data/triage.db` (WAL mode). It caches Jira ticket data and stores your decisions.
- **Mock Jira:** `JIRA_MOCK=1` replaces the Jira client with an in-memory mock backed by `test/fixtures/issues.json`.

## Prerequisites

- **Node.js 22.13 or newer** (the app uses the built-in `node:sqlite` module)
- npm
- A Jira Cloud site and an API token for the account you triage with (not needed in mock mode)

## Configuration

Copy the template and fill in your values:

```bash
cp .env.example .env
```

| Variable | Required | Description |
|---|---|---|
| `JIRA_BASE_URL` | Yes, unless `JIRA_MOCK=1` | Jira Cloud site URL, e.g. `https://your-site.atlassian.net`. |
| `JIRA_EMAIL` | Yes, unless `JIRA_MOCK=1` | Email of the Atlassian account that owns the API token. |
| `JIRA_API_TOKEN` | Yes, unless `JIRA_MOCK=1` | Atlassian API token. See below. |
| `PORT` | No | HTTP port. Default `3001`. The server always binds `127.0.0.1`. |
| `JIRA_MOCK` | No | `1` uses the fake tickets in `test/fixtures/issues.json`. Default `0`. |
| `DB_PATH` | No | SQLite file path, relative to the project root. Default `data/triage.db`. |

`.env` is loaded from the project root. Variables already set in the environment take precedence over `.env`.

### Create a Jira API token

1. Sign in to your Atlassian account and open the API token page: https://id.atlassian.com/manage-profile/security/api-tokens
2. Create a new API token and give it a label such as `jira-triage`.
3. Copy the token when it is shown and put it in `JIRA_API_TOKEN` in `.env`. Atlassian does not show it again.

A token acts with the permissions of the account it belongs to. Use an account that can read the projects you triage. Revoke the token on the same page when you no longer need it.

## Quick start

```bash
npm install
cp .env.example .env     # fill in JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN
npm start                # builds the UI, then serves http://127.0.0.1:3001
```

Open http://127.0.0.1:3001.

## Mock mode

Try the app without Jira:

```bash
JIRA_MOCK=1 npm start
```

This serves 40 fake tickets. Add `LIMIT=10` to the JQL to return only the first 10.

## Development

```bash
npm run dev
```

Runs the API server (with `--watch` on `server/`) and the Vite dev server together. Open http://127.0.0.1:5173; Vite proxies `/api` to the server on port 3001. For mock data during development, use `npm run dev:mock`.

## Tests and lint

```bash
npm test         # Vitest
npm run lint     # ESLint
```

## Deployment (self-hosting)

`scripts/deploy.sh` deploys the app on a Linux or macOS host:

```bash
npm run deploy                        # same as: bash scripts/deploy.sh
bash scripts/deploy.sh --skip-tests   # skip npm test
bash scripts/deploy.sh --status       # process state and health (exit 0 if healthy)
bash scripts/deploy.sh --stop         # stop the server
bash scripts/deploy.sh --help
```

What it does:

1. **Preflight:** checks Node.js ≥ 22.13 and npm. Unless `JIRA_MOCK=1`, it checks that `.env` exists and that the required variable names are set. It never prints values. If `.env` is readable by group or others, it sets the mode to `600`.
2. **Install:** `npm ci`.
3. **Test:** `npm test` (skip with `--skip-tests`).
4. **Build:** `npm run build`, which writes `web/dist/`.
5. **Start:** if [pm2](https://pm2.keymetrics.io/) is installed, it runs the server as pm2 app `jira-triage` and restarts it if it already exists. Otherwise it runs `node server/index.js` under `nohup`, with the PID file and logs in `.deploy/` (gitignored).
6. **Health check:** polls `http://127.0.0.1:$PORT/api/health` with retries and exits non-zero if the server does not become healthy.

`--stop` stops the pm2 app and/or the `nohup` process.

The script does not set up a reverse proxy, TLS, or user login. The server has no authentication of its own, so keep it on localhost or put it behind an access layer you control.

## Security notes

- **Never commit `.env`.** It holds your Jira API token. It is gitignored. `.env.example` is the only env template in the repo and holds placeholder values only.
- **Token scope:** the API token has the access of the account it belongs to. Use an account and token limited to what triage needs.
- **Localhost only:** the server binds `127.0.0.1`. The API token stays on the server and is never sent to the browser.
- **The database contains Jira data.** `data/*.db*` (including WAL and shared-memory files) caches real ticket content and is gitignored. Do not copy it into shared locations or commit it.
- **Runtime files:** `.deploy/` and `*.log` may contain operational details. They are gitignored.

## Project layout

```
server/            Express app, SQLite layer, Jira client, triage service
  index.js         entry point: loads .env, opens the DB, serves API and UI
  routes.js        HTTP API
  triage.js        session and decision logic
  db.js            SQLite schema and queries
  jira.js          Jira REST client and mock client
web/               React UI (Vite root); built to web/dist/
  src/             components and API client
test/              Vitest suites and fixtures
scripts/
  dev.js           runs the API server and Vite together (npm run dev)
  deploy.sh        self-hosting deploy script (npm run deploy)
specs/             design and build specs
data/              SQLite database location (gitignored; contents not committed)
.env.example       configuration template (copy to .env)
```
