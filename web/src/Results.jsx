import { useState, useEffect } from 'react';
import * as api from './api.js';

function Toast({ message, isError, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`toast${isError ? ' toast-error' : ''}`}>
      {message}
    </div>
  );
}

export default function Results({ sessionId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTabIndex, setSelectedTabIndex] = useState(0);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const loadResults = async () => {
      try {
        setLoading(true);
        setError(null);
        const results = await api.getResults(sessionId);
        if (isMounted) {
          setData(results);
          setSelectedTabIndex(0); // Reset to first tab
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || 'Failed to load results');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadResults();

    return () => {
      isMounted = false;
    };
  }, [sessionId]);

  const showToast = (message, isError = false) => {
    setToast({ message, isError });
  };

  const handleCopyJql = async (jql) => {
    if (!jql) return;
    try {
      await navigator.clipboard.writeText(jql);
      showToast('Copied');
    } catch (err) {
      showToast(`Failed to copy: ${err.message}`, true);
    }
  };

  const handleSyncLabels = async () => {
    const confirmed = window.confirm(
      'Add labels in Jira for all decided tickets not yet synced?'
    );
    if (!confirmed) return;

    try {
      const result = await api.syncLabels(sessionId);
      if (result.failed && result.failed.length > 0) {
        const failedText = result.failed
          .map((f) => `${f.issueKey}: ${f.error}`)
          .join('; ');
        showToast(
          `Synced ${result.synced}, failed ${result.failed.length}: ${failedText}`,
          true
        );
      } else {
        showToast(`Synced ${result.synced}, failed ${result.failed?.length || 0}`);
      }
    } catch (err) {
      showToast(`Sync failed: ${err.message}`, true);
    }
  };

  const handleReopen = async (issueKey) => {
    try {
      await api.reopen(sessionId, issueKey);
      showToast(`Reopened ${issueKey} — it's back in the queue`);
      // Reload results after reopening
      const results = await api.getResults(sessionId);
      setData(results);
    } catch (err) {
      showToast(`Failed to reopen: ${err.message}`, true);
    }
  };

  if (loading) {
    return (
      <div className="app">
        <div className="container">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app">
        <div className="container">
          <div style={{ color: 'red' }}>Error: {error}</div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="app">
        <div className="container">No data</div>
      </div>
    );
  }

  const { session, categories, groups, skipped } = data;

  // Create tabs: one for each group, plus skipped
  const tabs = groups.map((group, idx) => ({
    type: 'group',
    idx,
    label: `${group.category.name} (${group.items.length})`,
  }));
  tabs.push({
    type: 'skipped',
    label: `Skipped (${skipped.length})`,
  });

  const selectedTab = tabs[selectedTabIndex];
  let selectedItems = [];
  let selectedJql = '';

  if (selectedTab.type === 'group') {
    selectedItems = groups[selectedTab.idx].items;
    selectedJql = groups[selectedTab.idx].jql || '';
  } else if (selectedTab.type === 'skipped') {
    selectedItems = skipped.map((issue) => ({ issue, note: '', decidedAt: null }));
  }

  const hasJiraLabel = categories.some((cat) => cat.jiraLabel);

  return (
    <div className="app">
      <div className="topbar">
        <button
          className="btn btn-ghost"
          onClick={() => {
            window.location.hash = `#/s/${sessionId}`;
          }}
        >
          ← Back to triage
        </button>
        <button
          className="btn btn-ghost"
          onClick={() => {
            window.location.hash = '#/';
          }}
        >
          Sessions
        </button>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <h1>{session.name} — results</h1>
        </div>
      </div>

      <div className="container">
        <div className="tabs">
          {tabs.map((tab, idx) => (
            <button
              key={idx}
              className={`tab${selectedTabIndex === idx ? ' active' : ''}`}
              onClick={() => setSelectedTabIndex(idx)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {selectedItems.length === 0 ? (
          <div className="empty">Nothing here yet.</div>
        ) : (
          <>
            <div style={{ marginBottom: '1rem' }}>
              <button
                className="btn"
                onClick={() => handleCopyJql(selectedJql)}
                disabled={!selectedJql}
              >
                Copy JQL
              </button>
              <a
                className="btn"
                href={api.resultsCsvUrl(sessionId)}
                style={{ marginLeft: '0.5rem' }}
              >
                Download CSV
              </a>
              {hasJiraLabel && (
                <button
                  className="btn"
                  onClick={handleSyncLabels}
                  style={{ marginLeft: '0.5rem' }}
                >
                  Sync labels to Jira
                </button>
              )}
            </div>

            <table className="table">
              <thead>
                <tr>
                  <th>Key</th>
                  <th>Summary</th>
                  <th>Status</th>
                  <th>Priority</th>
                  {selectedTab.type === 'group' && <th>Note</th>}
                  {selectedTab.type === 'group' && <th>Decided at</th>}
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {selectedItems.map((item) => {
                  const { issue, note, decidedAt } = item;
                  return (
                    <tr key={issue.key}>
                      <td>
                        <a href={issue.url} target="_blank" rel="noreferrer">
                          {issue.key}
                        </a>
                      </td>
                      <td>{issue.summary}</td>
                      <td>{issue.status || '—'}</td>
                      <td>{issue.priority || '—'}</td>
                      {selectedTab.type === 'group' && <td>{note || '—'}</td>}
                      {selectedTab.type === 'group' && (
                        <td>
                          {decidedAt
                            ? new Date(decidedAt).toLocaleString()
                            : '—'}
                        </td>
                      )}
                      <td>
                        {selectedTab.type === 'group' && (
                          <button
                            className="btn btn-ghost"
                            onClick={() => handleReopen(issue.key)}
                          >
                            Reopen
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </div>

      {toast && (
        <Toast
          message={toast.message}
          isError={toast.isError}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
