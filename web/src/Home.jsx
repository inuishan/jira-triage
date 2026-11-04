import { useState, useEffect } from 'react';
import * as api from './api.js';

export default function Home() {
  const [health, setHealth] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    jql: '',
    categories: [
      { name: 'Accept', jiraLabel: '', hotkey: 'a', isReject: false },
      { name: 'Reject', jiraLabel: '', hotkey: 'r', isReject: true },
    ],
  });

  // Load data on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const healthData = await api.health();
        setHealth(healthData);
        const sessionsList = await api.listSessions();
        setSessions(sessionsList);
        setFormOpen(sessionsList.length === 0);
      } catch (err) {
        console.error('Failed to load data:', err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const handleDeleteSession = async (id, name) => {
    const confirmed = window.confirm(
      `Delete session "${name}"? Local decisions will be lost. Jira is not changed.`
    );
    if (!confirmed) return;

    try {
      await api.deleteSession(id);
      setSessions(sessions.filter((s) => s.id !== id));
    } catch (err) {
      console.error('Failed to delete session:', err);
    }
  };

  const getNextHotkey = () => {
    const used = new Set(formData.categories.map((c) => c.hotkey));
    for (let i = 49; i <= 57; i++) {
      const char = String.fromCharCode(i);
      if (!used.has(char)) return char;
    }
    return '';
  };

  const handleAddCategory = () => {
    setFormData({
      ...formData,
      categories: [
        ...formData.categories,
        {
          name: '',
          jiraLabel: '',
          hotkey: getNextHotkey(),
          isReject: false,
        },
      ],
    });
  };

  const handleRemoveCategory = (index) => {
    if (formData.categories.length <= 1) return;
    setFormData({
      ...formData,
      categories: formData.categories.filter((_, i) => i !== index),
    });
  };

  const handleCategoryChange = (index, field, value) => {
    const updated = [...formData.categories];
    updated[index] = { ...updated[index], [field]: value };
    setFormData({ ...formData, categories: updated });
  };

  const handleSubmitForm = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!formData.name.trim()) {
      setFormError('Name is required');
      return;
    }
    if (!formData.jql.trim()) {
      setFormError('JQL is required');
      return;
    }

    setFormLoading(true);
    try {
      const result = await api.createSession({
        name: formData.name,
        jql: formData.jql,
        categories: formData.categories,
      });
      location.hash = `#/s/${result.id}`;
    } catch (err) {
      setFormError(err.message || 'Failed to create session');
    } finally {
      setFormLoading(false);
    }
  };

  if (loading) {
    return <div className="app"><div className="container">Loading...</div></div>;
  }

  const hasNoSessions = sessions.length === 0;

  return (
    <div className="app">
      {health?.mock && (
        <div className="topbar">
          <span className="muted">Mock Jira mode</span>
        </div>
      )}
      <div className="container">
        <div style={{ marginBottom: '2rem' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem',
            }}
          >
            <h1 style={{ margin: 0 }}>Triage Sessions</h1>
            {!formOpen && (
              <button
                className="btn btn-primary"
                onClick={() => setFormOpen(true)}
              >
                + New session
              </button>
            )}
          </div>

          {formOpen && (
            <div style={{ marginBottom: '2rem', paddingBottom: '2rem', borderBottom: '1px solid #ccc' }}>
              <h2>Create New Session</h2>
              <form onSubmit={handleSubmitForm}>
                <div className="form-row">
                  <label>
                    Name
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      disabled={formLoading}
                    />
                  </label>
                </div>

                <div className="form-row">
                  <label>
                    JQL
                    <textarea
                      value={formData.jql}
                      onChange={(e) =>
                        setFormData({ ...formData, jql: e.target.value })
                      }
                      disabled={formLoading}
                      placeholder="project = ABC AND statusCategory != Done ORDER BY priority DESC"
                      style={{ fontFamily: 'monospace' }}
                    />
                  </label>
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <h3>Categories</h3>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.75rem',
                    }}
                  >
                    {formData.categories.map((cat, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr auto auto auto',
                          gap: '0.5rem',
                          alignItems: 'center',
                        }}
                      >
                        <input
                          type="text"
                          placeholder="Name"
                          value={cat.name}
                          onChange={(e) =>
                            handleCategoryChange(idx, 'name', e.target.value)
                          }
                          disabled={formLoading}
                        />
                        <input
                          type="text"
                          placeholder="optional label to add in Jira"
                          value={cat.jiraLabel}
                          onChange={(e) =>
                            handleCategoryChange(idx, 'jiraLabel', e.target.value)
                          }
                          disabled={formLoading}
                        />
                        <input
                          type="text"
                          placeholder="Hotkey"
                          maxLength="1"
                          value={cat.hotkey}
                          onChange={(e) =>
                            handleCategoryChange(idx, 'hotkey', e.target.value)
                          }
                          disabled={formLoading}
                          style={{ width: '3rem' }}
                        />
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <input
                            type="checkbox"
                            checked={cat.isReject}
                            onChange={(e) =>
                              handleCategoryChange(idx, 'isReject', e.target.checked)
                            }
                            disabled={formLoading}
                          />
                          Reject
                        </label>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => handleRemoveCategory(idx)}
                          disabled={formLoading || formData.categories.length <= 1}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="btn"
                    onClick={handleAddCategory}
                    disabled={formLoading}
                    style={{ marginTop: '0.75rem' }}
                  >
                    Add category
                  </button>
                  <div className="muted" style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>
                    Decisions are stored locally. Jira labels are only written if you turn on
                    label sync inside the session.
                  </div>
                </div>

                {formError && (
                  <div
                    style={{
                      marginBottom: '1rem',
                      padding: '12px 20px',
                      borderRadius: '6px',
                      background: '#d4634f',
                      color: 'white',
                      fontSize: '0.95rem',
                    }}
                  >
                    {formError}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={formLoading}
                  >
                    {formLoading ? 'Fetching issues…' : 'Create session'}
                  </button>
                  {!formLoading && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => setFormOpen(false)}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            </div>
          )}
        </div>

        {hasNoSessions && !formOpen ? (
          <div className="empty">No triage sessions yet.</div>
        ) : (
          <div className="session-list">
            {sessions.map((session) => {
              const progressPercentage =
                session.counts.total > 0
                  ? Math.round((session.counts.decided / session.counts.total) * 100)
                  : 0;
              const createdDate = new Date(session.createdAt).toLocaleDateString();

              return (
                <div key={session.id} className="session-item">
                  <div style={{ marginBottom: '0.5rem' }}>
                    <h3 style={{ margin: '0 0 0.25rem 0' }}>{session.name}</h3>
                    <div
                      style={{
                        fontFamily: 'monospace',
                        fontSize: '0.875rem',
                        color: '#666',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        marginBottom: '0.25rem',
                      }}
                    >
                      {session.jql}
                    </div>
                    <div
                      style={{
                        fontSize: '0.875rem',
                        color: '#666',
                        marginBottom: '0.5rem',
                      }}
                    >
                      {createdDate}
                    </div>
                  </div>

                  <div className="progress" style={{ marginBottom: '0.75rem' }}>
                    <div
                      className="progress-bar"
                      style={{ width: `${progressPercentage}%` }}
                    />
                  </div>

                  <div
                    style={{
                      fontSize: '0.875rem',
                      marginBottom: '0.75rem',
                      color: '#666',
                    }}
                  >
                    {session.counts.decided} / {session.counts.total}
                    {session.counts.skipped > 0 && ` (${session.counts.skipped} skipped)`}
                  </div>

                  <div className="actions" style={{ display: 'flex', gap: '0.5rem' }}>
                    <a href={`#/s/${session.id}`} className="btn btn-primary">
                      Continue
                    </a>
                    <a href={`#/s/${session.id}/results`} className="btn">
                      Results
                    </a>
                    <button
                      className="btn btn-ghost"
                      onClick={() => handleDeleteSession(session.id, session.name)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
