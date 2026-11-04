import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import { openDb } from './db.js';
import { createJiraFromEnv } from './jira.js';
import { createTriageService } from './triage.js';
import { createApp } from './routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

// Resolve .env and the DB from the project root so launching from another cwd
// doesn't silently start an empty database.
dotenv.config({ path: path.join(root, '.env'), quiet: true });

let jira;
try {
  jira = createJiraFromEnv(process.env);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const db = openDb(path.resolve(root, process.env.DB_PATH || 'data/triage.db'));
const service = createTriageService({ db, jira });

const app = createApp({
  service,
  info: { mock: process.env.JIRA_MOCK === '1', jiraBaseUrl: jira.baseUrl },
});

const distIndex = path.join(root, 'web', 'dist', 'index.html');
if (fs.existsSync(distIndex)) {
  const distDir = path.dirname(distIndex);
  app.use(express.static(distDir));
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(distIndex);
  });
}

const port = process.env.PORT || 3001;
const server = app.listen(port, '127.0.0.1', () => {
  const target = process.env.JIRA_MOCK === '1' ? '(mock Jira)' : `(Jira: ${jira.baseUrl})`;
  console.log(`Jira triage on http://127.0.0.1:${port} ${target}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use — is another jira-triage server still running? Stop it and retry.`);
  } else {
    console.error(err.message);
  }
  process.exit(1);
});
