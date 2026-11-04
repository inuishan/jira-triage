import { describe, it, expect } from 'vitest';
import { filterIssues, categoryColor } from '../web/src/Sidebar.jsx';

// Test data
const mockIssues = [
  {
    key: 'DEMO-1',
    summary: 'Fix login bug',
    type: 'Bug',
    status: 'To Do',
    priority: 'High',
    assignee: 'Alice',
    url: 'https://example.com/browse/DEMO-1',
    position: 0,
    decision: null,
  },
  {
    key: 'DEMO-2',
    summary: 'Add feature',
    type: 'Story',
    status: 'In Progress',
    priority: 'Medium',
    assignee: 'Bob',
    url: 'https://example.com/browse/DEMO-2',
    position: 1,
    decision: { status: 'decided', categoryId: 1, note: '', decidedAt: '2026-10-07T12:00:00Z' },
  },
  {
    key: 'DEMO-3',
    summary: 'Update docs',
    type: 'Task',
    status: 'Done',
    priority: 'Low',
    assignee: 'Charlie',
    url: 'https://example.com/browse/DEMO-3',
    position: 2,
    decision: { status: 'skipped', categoryId: null, note: '', decidedAt: '2026-10-07T11:00:00Z' },
  },
  {
    key: 'DEMO-4',
    summary: 'Refactor API',
    type: 'Task',
    status: 'To Do',
    priority: null,
    assignee: null,
    url: 'https://example.com/browse/DEMO-4',
    position: 3,
    decision: { status: 'decided', categoryId: 2, note: '', decidedAt: '2026-10-07T10:00:00Z' },
  },
  {
    key: 'DEMO-5',
    summary: 'Deploy to production',
    type: 'Release',
    status: 'To Do',
    priority: 'Critical',
    assignee: 'Alice',
    url: 'https://example.com/browse/DEMO-5',
    position: 4,
    decision: null,
  },
];

const mockCategories = [
  { id: 1, name: 'Accept', isReject: false, hotkey: 'a', position: 0 },
  { id: 2, name: 'Review', isReject: false, hotkey: 'r', position: 1 },
  { id: 3, name: 'Reject', isReject: true, hotkey: 'x', position: 2 },
];

describe('filterIssues', () => {
  describe('filter by type', () => {
    it('returns all issues when filter is "all"', () => {
      const result = filterIssues(mockIssues, 'all', '');
      expect(result).toHaveLength(5);
      expect(result).toEqual(mockIssues);
    });

    it('returns only undecided issues when filter is "undecided"', () => {
      const result = filterIssues(mockIssues, 'undecided', '');
      expect(result).toHaveLength(2);
      expect(result[0].key).toBe('DEMO-1');
      expect(result[1].key).toBe('DEMO-5');
    });

    it('returns only skipped issues when filter is "skipped"', () => {
      const result = filterIssues(mockIssues, 'skipped', '');
      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('DEMO-3');
    });

    it('returns issues by category when filter is "cat:<id>"', () => {
      const result = filterIssues(mockIssues, 'cat:1', '');
      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('DEMO-2');

      const result2 = filterIssues(mockIssues, 'cat:2', '');
      expect(result2).toHaveLength(1);
      expect(result2[0].key).toBe('DEMO-4');
    });

    it('returns empty array when filtering by category with no matches', () => {
      const result = filterIssues(mockIssues, 'cat:999', '');
      expect(result).toHaveLength(0);
    });
  });

  describe('search functionality', () => {
    it('searches by issue key (case-insensitive)', () => {
      const result = filterIssues(mockIssues, 'all', 'demo-2');
      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('DEMO-2');
    });

    it('searches by summary (case-insensitive)', () => {
      const result = filterIssues(mockIssues, 'all', 'bug');
      expect(result).toHaveLength(1);
      expect(result[0].summary).toBe('Fix login bug');
    });

    it('searches by assignee (case-insensitive)', () => {
      const result = filterIssues(mockIssues, 'all', 'alice');
      expect(result).toHaveLength(2);
      expect(result.map((i) => i.key)).toEqual(['DEMO-1', 'DEMO-5']);
    });

    it('ignores leading and trailing whitespace in search', () => {
      const result = filterIssues(mockIssues, 'all', '  demo-1  ');
      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('DEMO-1');
    });

    it('returns all issues when search is empty string', () => {
      const result = filterIssues(mockIssues, 'all', '');
      expect(result).toHaveLength(5);
    });

    it('returns empty array when search matches nothing', () => {
      const result = filterIssues(mockIssues, 'all', 'nonexistent');
      expect(result).toHaveLength(0);
    });
  });

  describe('combined filter and search', () => {
    it('applies both filter and search', () => {
      const result = filterIssues(mockIssues, 'undecided', 'demo-1');
      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('DEMO-1');
    });

    it('filters to undecided then searches by summary', () => {
      const result = filterIssues(mockIssues, 'undecided', 'deploy');
      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('DEMO-5');
    });

    it('filters to category then searches by assignee', () => {
      // Create issues where both assigned to different people
      const issues = [
        { key: 'A-1', summary: 'Task A', assignee: 'Alice', decision: { status: 'decided', categoryId: 1 } },
        { key: 'A-2', summary: 'Task B', assignee: 'Bob', decision: { status: 'decided', categoryId: 1 } },
      ];
      const result = filterIssues(issues, 'cat:1', 'alice');
      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('A-1');
    });

    it('returns empty when search excludes all filtered results', () => {
      const result = filterIssues(mockIssues, 'undecided', 'skipped');
      expect(result).toHaveLength(0);
    });
  });

  describe('input order preservation', () => {
    it('keeps input order after filtering', () => {
      const result = filterIssues(mockIssues, 'all', '');
      const keys = result.map((i) => i.key);
      expect(keys).toEqual(['DEMO-1', 'DEMO-2', 'DEMO-3', 'DEMO-4', 'DEMO-5']);
    });

    it('keeps input order when filtering undecided', () => {
      const result = filterIssues(mockIssues, 'undecided', '');
      const keys = result.map((i) => i.key);
      expect(keys).toEqual(['DEMO-1', 'DEMO-5']);
    });
  });
});

describe('categoryColor', () => {
  it('returns reject color for reject categories', () => {
    const rejectCat = { id: 3, name: 'Reject', isReject: true };
    const color = categoryColor(rejectCat, mockCategories);
    expect(color).toBe('#e03131');
  });

  it('returns color by position for non-reject categories', () => {
    const acceptCat = { id: 1, name: 'Accept', isReject: false };
    const color = categoryColor(acceptCat, mockCategories);
    expect(color).toBe('#2f9e44'); // First color in palette
  });

  it('uses correct color for second category', () => {
    const reviewCat = { id: 2, name: 'Review', isReject: false };
    const color = categoryColor(reviewCat, mockCategories);
    expect(color).toBe('#1971c2'); // Second color in palette
  });

  it('wraps around color palette for many categories', () => {
    const manyCategories = [
      { id: 1, name: 'Cat1', isReject: false, position: 0 },
      { id: 2, name: 'Cat2', isReject: false, position: 1 },
      { id: 3, name: 'Cat3', isReject: false, position: 2 },
      { id: 4, name: 'Cat4', isReject: false, position: 3 },
      { id: 5, name: 'Cat5', isReject: false, position: 4 },
      { id: 6, name: 'Cat6', isReject: false, position: 5 },
      { id: 7, name: 'Cat7', isReject: false, position: 6 },
      { id: 8, name: 'Cat8', isReject: false, position: 7 },
      { id: 9, name: 'Cat9', isReject: false, position: 8 },
      { id: 10, name: 'Cat10', isReject: false, position: 9 }, // Should wrap to index 0
    ];

    const cat10 = { id: 10, name: 'Cat10', isReject: false };
    const color = categoryColor(cat10, manyCategories);
    expect(color).toBe('#2f9e44'); // First color, wrapped around
  });

  it('finds category by id, not position in input', () => {
    // Test that categoryColor uses the correct findIndex based on category id
    const reorderedCategories = [
      { id: 3, name: 'Cat3', isReject: false },
      { id: 1, name: 'Cat1', isReject: false },
      { id: 2, name: 'Cat2', isReject: false },
    ];

    const cat2 = { id: 2, name: 'Cat2', isReject: false };
    const color = categoryColor(cat2, reorderedCategories);
    // cat2 should be at index 2 in the reorderedCategories
    expect(color).toBe('#9c36b5'); // Third color in palette
  });
});
