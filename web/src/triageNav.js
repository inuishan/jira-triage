// Pure navigation helpers for the Triage page. No side effects.

export function initialKey(issues, savedKey) {
  if (savedKey && issues.some((i) => i.key === savedKey)) {
    return savedKey;
  }
  const undecided = issues.find((i) => i.decision === null);
  if (undecided) return undecided.key;
  const skipped = issues.find((i) => i.decision && i.decision.status === 'skipped');
  if (skipped) return skipped.key;
  return issues[0]?.key ?? null;
}

export function nextKeyAfter(issues, currentKey) {
  const idx = issues.findIndex((i) => i.key === currentKey);
  const n = issues.length;
  if (n === 0) return currentKey;

  for (let step = 1; step <= n; step += 1) {
    const candidate = issues[(idx + step + n) % n];
    if (candidate.decision === null) return candidate.key;
  }

  const skipped = issues.find((i) => i.decision && i.decision.status === 'skipped' && i.key !== currentKey);
  if (skipped) return skipped.key;

  return currentKey;
}

export function stepKey(list, currentKey, delta) {
  if (list.length === 0) return currentKey;
  const idx = list.findIndex((i) => i.key === currentKey);
  if (idx === -1) return list[0]?.key ?? currentKey;
  const next = Math.min(Math.max(idx + delta, 0), list.length - 1);
  return list[next].key;
}

export function upcomingUndecided(issues, currentKey, n = 2) {
  const idx = issues.findIndex((i) => i.key === currentKey);
  const len = issues.length;
  if (len === 0) return [];
  const result = [];
  const start = idx === -1 ? 0 : idx;

  for (let step = 1; step <= len && result.length < n; step += 1) {
    const candidate = issues[(start + step) % len];
    if (candidate.key === currentKey) continue;
    if (candidate.decision === null) result.push(candidate.key);
  }

  return result;
}
