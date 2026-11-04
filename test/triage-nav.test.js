import { describe, it, expect } from 'vitest';
import { initialKey, nextKeyAfter, stepKey, upcomingUndecided } from '../web/src/triageNav.js';

function issue(key, status) {
  // status: null = undecided, 'decided' or 'skipped'
  return {
    key,
    decision: status === null ? null : { status, categoryId: status === 'decided' ? 1 : null, note: '', decidedAt: '2026-01-01T00:00:00.000Z' },
  };
}

describe('initialKey', () => {
  const cases = [
    {
      name: 'savedKey present in issues is used',
      issues: [issue('A-1', null), issue('A-2', null)],
      savedKey: 'A-2',
      expected: 'A-2',
    },
    {
      name: 'savedKey missing falls back to first undecided',
      issues: [issue('A-1', 'decided'), issue('A-2', null)],
      savedKey: 'ZZZ-9',
      expected: 'A-2',
    },
    {
      name: 'no savedKey, no undecided, falls back to first skipped',
      issues: [issue('A-1', 'decided'), issue('A-2', 'skipped')],
      savedKey: null,
      expected: 'A-2',
    },
    {
      name: 'no undecided or skipped falls back to first issue',
      issues: [issue('A-1', 'decided'), issue('A-2', 'decided')],
      savedKey: null,
      expected: 'A-1',
    },
    {
      name: 'empty issues returns null',
      issues: [],
      savedKey: 'A-1',
      expected: null,
    },
  ];

  for (const { name, issues, savedKey, expected } of cases) {
    it(name, () => {
      expect(initialKey(issues, savedKey)).toBe(expected);
    });
  }
});

describe('nextKeyAfter', () => {
  const cases = [
    {
      name: 'finds next undecided after current',
      issues: [issue('A-1', 'decided'), issue('A-2', null), issue('A-3', null)],
      current: 'A-1',
      expected: 'A-2',
    },
    {
      name: 'wraps to start when no undecided after current',
      issues: [issue('A-1', null), issue('A-2', 'decided'), issue('A-3', 'decided')],
      current: 'A-3',
      expected: 'A-1',
    },
    {
      name: 'all decided falls back to first skipped (not current)',
      issues: [issue('A-1', 'decided'), issue('A-2', 'skipped'), issue('A-3', 'decided')],
      current: 'A-3',
      expected: 'A-2',
    },
    {
      name: 'all decided and current is the only skipped stays on current',
      issues: [issue('A-1', 'decided'), issue('A-2', 'skipped')],
      current: 'A-2',
      expected: 'A-2',
    },
    {
      name: 'all decided, no skipped at all, stays on current',
      issues: [issue('A-1', 'decided'), issue('A-2', 'decided')],
      current: 'A-1',
      expected: 'A-1',
    },
  ];

  for (const { name, issues, current, expected } of cases) {
    it(name, () => {
      expect(nextKeyAfter(issues, current)).toBe(expected);
    });
  }
});

describe('stepKey', () => {
  const list = [issue('A-1', null), issue('A-2', null), issue('A-3', null)];

  const cases = [
    { name: 'steps forward within bounds', current: 'A-1', delta: 1, expected: 'A-2' },
    { name: 'steps backward within bounds', current: 'A-2', delta: -1, expected: 'A-1' },
    { name: 'clamps at end', current: 'A-3', delta: 1, expected: 'A-3' },
    { name: 'clamps at start', current: 'A-1', delta: -1, expected: 'A-1' },
    { name: 'current not in filtered list falls back to list[0]', current: 'ZZZ-9', delta: 1, expected: 'A-1' },
  ];

  for (const { name, current, delta, expected } of cases) {
    it(name, () => {
      expect(stepKey(list, current, delta)).toBe(expected);
    });
  }

  it('empty list keeps current key', () => {
    expect(stepKey([], 'A-1', 1)).toBe('A-1');
  });
});

describe('upcomingUndecided', () => {
  const cases = [
    {
      name: 'returns next n undecided after current',
      issues: [issue('A-1', null), issue('A-2', null), issue('A-3', null), issue('A-4', null)],
      current: 'A-1',
      n: 2,
      expected: ['A-2', 'A-3'],
    },
    {
      name: 'wraps around to find undecided before current',
      issues: [issue('A-1', null), issue('A-2', 'decided'), issue('A-3', 'decided'), issue('A-4', null)],
      current: 'A-3',
      n: 2,
      expected: ['A-4', 'A-1'],
    },
    {
      name: 'excludes current key even if undecided',
      issues: [issue('A-1', null), issue('A-2', 'decided')],
      current: 'A-1',
      n: 2,
      expected: [],
    },
    {
      name: 'fewer than n undecided available returns what exists',
      issues: [issue('A-1', null), issue('A-2', 'decided'), issue('A-3', 'decided')],
      current: 'A-2',
      n: 2,
      expected: ['A-1'],
    },
  ];

  for (const { name, issues, current, n, expected } of cases) {
    it(name, () => {
      expect(upcomingUndecided(issues, current, n)).toEqual(expected);
    });
  }
});
