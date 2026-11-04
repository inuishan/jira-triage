import { categoryColor } from './Sidebar.jsx';
import './StatsPanel.css';

export default function StatsPanel({ stats, categories, compact }) {
  if (!stats) {
    return compact ? null : <div className="stats-loading">Loading metrics…</div>;
  }

  if (compact) {
    return <CompactStats stats={stats} categories={categories} />;
  }

  return <FullStats stats={stats} categories={categories} />;
}

function CompactStats({ stats, categories }) {
  const { counts, byCategory, pace } = stats;

  const getCategoryColor = (categoryId) => {
    const cat = categories.find((c) => c.id === categoryId);
    return cat ? categoryColor(cat, categories) : '#868e96';
  };

  // Build pace string
  let paceStr = '';
  if (pace.avgSecondsPerDecision !== null) {
    paceStr = `~${Math.round(pace.avgSecondsPerDecision)}s/ticket`;
  }
  if (pace.etaMinutes !== null) {
    const minutes = pace.etaMinutes;
    const etaStr = minutes >= 60
      ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
      : `${minutes}m`;
    paceStr = paceStr ? `${paceStr} · ETA ${etaStr}` : `ETA ${etaStr}`;
  }
  if (pace.decidedToday) {
    paceStr = paceStr ? `${paceStr} · ${pace.decidedToday} today` : `${pace.decidedToday} today`;
  }

  return (
    <div className="stats-compact">
      {/* Progress bar */}
      <div className="stats-progress-bar">
        {byCategory.map((cat) => {
          if (cat.count === 0) return null;
          const width = (cat.count / counts.total) * 100;
          return (
            <div
              key={cat.categoryId}
              className="stats-progress-segment"
              style={{
                width: `${width}%`,
                backgroundColor: getCategoryColor(cat.categoryId),
              }}
              title={`${cat.name}: ${cat.count}`}
            />
          );
        })}
        {counts.skipped > 0 && (
          <div
            className="stats-progress-segment"
            style={{
              width: `${(counts.skipped / counts.total) * 100}%`,
              backgroundColor: '#868e96',
            }}
            title={`Skipped: ${counts.skipped}`}
          />
        )}
      </div>

      {/* Text summary */}
      <div className="stats-text-summary">
        <span className="stats-decided">
          <strong>{counts.decided}</strong>/{counts.total} decided
        </span>
        {byCategory.map((cat) => (
          <span key={cat.categoryId} className="stats-category-item">
            <span
              className="stats-dot"
              style={{
                backgroundColor: getCategoryColor(cat.categoryId),
              }}
            />
            {cat.name} {cat.count}
          </span>
        ))}
        {counts.skipped > 0 && (
          <span className="stats-skipped">Skipped {counts.skipped}</span>
        )}
        <span className="stats-left">Left {counts.undecided}</span>
      </div>

      {/* Pace */}
      {paceStr && <div className="stats-pace muted">{paceStr}</div>}
    </div>
  );
}

function FullStats({ stats, categories }) {
  const { counts, byCategory, pace, breakdown } = stats;

  const decidedPercent = counts.total > 0 ? Math.round((counts.decided / counts.total) * 100) : 0;

  const getCategoryColor = (categoryId) => {
    const cat = categories.find((c) => c.id === categoryId);
    return cat ? categoryColor(cat, categories) : '#868e96';
  };

  return (
    <div className="stats-full">
      {/* Tiles */}
      <div className="stats-tiles">
        <Tile label="Total" value={counts.total} />
        <Tile label="Decided" value={`${counts.decided} (${decidedPercent}%)`} />
        <Tile label="Undecided" value={counts.undecided} />
        <Tile label="Skipped" value={counts.skipped} />

        {byCategory.map((cat) => (
          <Tile
            key={cat.categoryId}
            label={cat.name}
            value={cat.count}
            color={getCategoryColor(cat.categoryId)}
          />
        ))}

        <Tile label="Today" value={pace.decidedToday} />

        {pace.etaMinutes !== null && (
          <Tile label="ETA" value={formatEta(pace.etaMinutes)} />
        )}
      </div>

      {/* Breakdown sections */}
      {breakdown.priority && breakdown.priority.length > 0 && (
        <BreakdownSection title="Priority" items={breakdown.priority} categories={categories} byCategory={byCategory} getCategoryColor={getCategoryColor} />
      )}
      {breakdown.type && breakdown.type.length > 0 && (
        <BreakdownSection title="Type" items={breakdown.type} categories={categories} byCategory={byCategory} getCategoryColor={getCategoryColor} />
      )}
      {breakdown.status && breakdown.status.length > 0 && (
        <BreakdownSection title="Status" items={breakdown.status} categories={categories} byCategory={byCategory} getCategoryColor={getCategoryColor} />
      )}
      {breakdown.assignee && breakdown.assignee.length > 0 && (
        <BreakdownSection title="Assignee" items={breakdown.assignee} categories={categories} byCategory={byCategory} getCategoryColor={getCategoryColor} />
      )}
    </div>
  );
}

function Tile({ label, value, color }) {
  return (
    <div className="stats-tile" style={color ? { borderTopColor: color } : {}}>
      <div className="stats-tile-label">{label}</div>
      <div className="stats-tile-value">{value}</div>
    </div>
  );
}

function BreakdownSection({ title, items, byCategory, getCategoryColor }) {
  return (
    <div className="stats-breakdown-section">
      <h3 className="stats-breakdown-title">{title}</h3>
      <table className="table stats-breakdown-table">
        <thead>
          <tr>
            <th>Value</th>
            <th>Total</th>
            <th>Undecided</th>
            {byCategory.map((cat) => (
              <th key={cat.categoryId}>{cat.name}</th>
            ))}
            <th>Bar</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={idx}>
              <td>{item.value === 'None' ? <span className="muted">None</span> : item.value}</td>
              <td className="stats-number">{item.total === 0 ? <span className="muted">·</span> : item.total}</td>
              <td className="stats-number">{item.undecided === 0 ? <span className="muted">·</span> : item.undecided}</td>
              {byCategory.map((cat) => (
                <td key={cat.categoryId} className="stats-number">
                  {(item.byCategory[cat.categoryId] || 0) === 0 ? (
                    <span className="muted">·</span>
                  ) : (
                    item.byCategory[cat.categoryId]
                  )}
                </td>
              ))}
              <td>
                <MiniBar item={item} byCategory={byCategory} getCategoryColor={getCategoryColor} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MiniBar({ item, byCategory, getCategoryColor }) {
  const total = item.total || 1;
  return (
    <div className="stats-mini-bar">
      {byCategory.map((cat) => {
        const count = item.byCategory[cat.categoryId] || 0;
        if (count === 0) return null;
        return (
          <div
            key={cat.categoryId}
            className="stats-mini-segment"
            style={{
              width: `${(count / total) * 100}%`,
              backgroundColor: getCategoryColor(cat.categoryId),
            }}
          />
        );
      })}
      {item.undecided > 0 && (
        <div
          className="stats-mini-segment"
          style={{
            width: `${(item.undecided / total) * 100}%`,
            backgroundColor: '#868e96',
          }}
        />
      )}
    </div>
  );
}

function formatEta(minutes) {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}
