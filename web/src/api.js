async function request(method, path, body) {
  const options = {
    method,
  };

  if (body) {
    options.headers = { 'Content-Type': 'application/json' };
    options.body = JSON.stringify(body);
  }

  const res = await fetch(`/api${path}`, options);

  if (res.status === 204) {
    return null;
  }

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || `${res.status} ${res.statusText}`);
  }

  return data;
}

export function health() {
  return request('GET', '/health');
}

export function listSessions() {
  return request('GET', '/sessions');
}

export function createSession(body) {
  return request('POST', '/sessions', body);
}

export function getSession(id) {
  return request('GET', `/sessions/${id}`);
}

export function deleteSession(id) {
  return request('DELETE', `/sessions/${id}`);
}

export function updateSession(id, patch) {
  return request('PATCH', `/sessions/${id}`, patch);
}

export function refresh(id) {
  return request('POST', `/sessions/${id}/refresh`);
}

export function getQueue(id) {
  return request('GET', `/sessions/${id}/queue`);
}

export function decide(id, body) {
  return request('POST', `/sessions/${id}/decide`, body);
}

export function skip(id, body) {
  return request('POST', `/sessions/${id}/skip`, body);
}

export function undo(id) {
  return request('POST', `/sessions/${id}/undo`);
}

export function reopen(id, issueKey) {
  return request('POST', `/sessions/${id}/reopen`, { issueKey });
}

export function syncLabels(id) {
  return request('POST', `/sessions/${id}/sync-labels`);
}

export function getResults(id) {
  return request('GET', `/sessions/${id}/results`);
}

export function resultsCsvUrl(id) {
  return `/api/sessions/${id}/results.csv`;
}

export function listIssues(id) {
  return request('GET', `/sessions/${id}/issues`);
}

export function getIssueDetail(id, key, { refresh } = {}) {
  const query = refresh ? '?refresh=1' : '';
  return request('GET', `/sessions/${id}/issues/${encodeURIComponent(key)}/detail${query}`);
}

export function getStats(id) {
  return request('GET', `/sessions/${id}/stats`);
}
