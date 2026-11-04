import { useEffect, useRef } from 'react';
import './Sidebar.css';

const CATEGORY_COLORS = [
  '#2f9e44', '#1971c2', '#9c36b5', '#e8590c', '#0c8599', '#5c940d', '#c2255c', '#5f3dc4', '#868e96',
];

const REJECT_COLOR = '#e03131';
const SKIPPED_COLOR = '#868e96';

/**
 * Get the color for a category based on its position
 */
export function categoryColor(category, categories) {
  if (category.isReject) {
    return REJECT_COLOR;
  }
  const index = categories.findIndex((c) => c.id === category.id);
  return CATEGORY_COLORS[index % CATEGORY_COLORS.length];
}

/**
 * Filter issues based on filter type and search text
 */
export function filterIssues(issues, filter, search) {
  let filtered = issues;

  // Apply filter
  if (filter === 'undecided') {
    filtered = filtered.filter((issue) => issue.decision === null);
  } else if (filter === 'skipped') {
    filtered = filtered.filter((issue) => issue.decision?.status === 'skipped');
  } else if (filter.startsWith('cat:')) {
    const categoryId = parseInt(filter.slice(4), 10);
    filtered = filtered.filter(
      (issue) => issue.decision?.status === 'decided' && issue.decision?.categoryId === categoryId
    );
  }
  // 'all' has no additional filter

  // Apply search
  const searchLower = (search || '').trim().toLowerCase();
  if (searchLower) {
    filtered = filtered.filter((issue) => {
      const key = (issue.key || '').toLowerCase();
      const summary = (issue.summary || '').toLowerCase();
      const assignee = (issue.assignee || '').toLowerCase();
      return key.includes(searchLower) || summary.includes(searchLower) || assignee.includes(searchLower);
    });
  }

  return filtered;
}

/**
 * Calculate counts for all filter options
 */
function calculateCounts(issues) {
  const counts = {
    all: issues.length,
    undecided: 0,
    skipped: 0,
    byCategory: {},
  };

  issues.forEach((issue) => {
    if (issue.decision === null) {
      counts.undecided += 1;
    } else if (issue.decision.status === 'skipped') {
      counts.skipped += 1;
    } else if (issue.decision.status === 'decided') {
      const catId = issue.decision.categoryId;
      counts.byCategory[catId] = (counts.byCategory[catId] || 0) + 1;
    }
  });

  return counts;
}

export default function Sidebar({
  issues,
  categories,
  currentKey,
  filter,
  onFilterChange,
  search,
  onSearchChange,
  onSelect,
  searchInputRef,
}) {
  const itemRefsMap = useRef({});

  // Scroll into view when currentKey changes
  useEffect(() => {
    if (currentKey && itemRefsMap.current[currentKey]) {
      itemRefsMap.current[currentKey].scrollIntoView({ block: 'nearest' });
    }
  }, [currentKey]);

  const counts = calculateCounts(issues);
  const filtered = filterIssues(issues, filter, search);

  // Handle Enter/Space in list items
  const handleKeyDown = (e, key) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(key);
    }
  };

  // Handle Escape in search input
  const handleSearchKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      searchInputRef?.current?.blur();
    }
  };

  return (
    <aside className="sidebar">
      {/* Search Input */}
      <input
        ref={searchInputRef}
        className="sidebar-search"
        placeholder="Search key, summary, assignee   ( / )"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        onKeyDown={handleSearchKeyDown}
      />

      {/* Filter Chips */}
      <div className="sidebar-chips">
        <button
          className={`sidebar-chip ${filter === 'all' ? 'active' : ''}`}
          onClick={() => onFilterChange('all')}
        >
          All {counts.all}
        </button>

        <button
          className={`sidebar-chip ${filter === 'undecided' ? 'active' : ''}`}
          onClick={() => onFilterChange('undecided')}
        >
          Undecided {counts.undecided}
        </button>

        {categories.map((cat) => (
          <button
            key={cat.id}
            className={`sidebar-chip ${filter === `cat:${cat.id}` ? 'active' : ''}`}
            onClick={() => onFilterChange(`cat:${cat.id}`)}
          >
            <span
              className="sidebar-chip-dot"
              style={{ backgroundColor: categoryColor(cat, categories) }}
            />
            {cat.name} {counts.byCategory[cat.id] || 0}
          </button>
        ))}

        <button
          className={`sidebar-chip ${filter === 'skipped' ? 'active' : ''}`}
          onClick={() => onFilterChange('skipped')}
        >
          Skipped {counts.skipped}
        </button>
      </div>

      {/* Result Count */}
      <div className="sidebar-count muted">
        Showing {filtered.length} of {issues.length}
      </div>

      {/* Issues List */}
      {filtered.length === 0 ? (
        <div className="sidebar-empty">No issues match</div>
      ) : (
        <ul className="sidebar-list">
          {filtered.map((issue) => {
            const isDecided = issue.decision?.status === 'decided';
            const isSkipped = issue.decision?.status === 'skipped';
            let barColor = 'transparent';
            let barStyle = '';
            if (isDecided) {
              const cat = categories.find((c) => c.id === issue.decision.categoryId);
              if (cat) {
                barColor = categoryColor(cat, categories);
              }
            } else if (isSkipped) {
              barStyle = 'dashed';
              barColor = SKIPPED_COLOR;
            }

            const decisionLabel = isDecided
              ? categories.find((c) => c.id === issue.decision.categoryId)?.name
              : isSkipped
                ? 'Skipped'
                : null;

            return (
              <li
                key={issue.key}
                ref={(el) => {
                  if (el) itemRefsMap.current[issue.key] = el;
                }}
                className={`sidebar-item ${currentKey === issue.key ? 'current' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(issue.key)}
                onKeyDown={(e) => handleKeyDown(e, issue.key)}
                aria-current={currentKey === issue.key}
              >
                <div
                  className="sidebar-item-bar"
                  style={{
                    backgroundColor: barColor,
                    borderLeft: barStyle === 'dashed' ? `4px dashed ${barColor}` : 'none',
                    ...(!barStyle && { borderLeft: `4px solid ${barColor}` }),
                  }}
                />
                <div className="sidebar-item-content">
                  {/* Line 1: Key, Priority, Type */}
                  <div className="sidebar-item-line1">
                    <span className="sidebar-item-key">{issue.key}</span>
                    {issue.priority && <span className="sidebar-item-priority">{issue.priority}</span>}
                    {issue.type && <span className="sidebar-item-type">{issue.type}</span>}
                  </div>

                  {/* Line 2: Summary */}
                  <div className="sidebar-item-summary">{issue.summary}</div>

                  {/* Line 3: Status, Assignee, Decision */}
                  <div className="sidebar-item-line3">
                    <span className="sidebar-item-status">{issue.status}</span>
                    <span className="sidebar-item-assignee">
                      {issue.assignee || 'Unassigned'}
                    </span>
                    {decisionLabel && (
                      <span className="sidebar-item-decision">{decisionLabel}</span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
