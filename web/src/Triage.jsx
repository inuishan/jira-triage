import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as api from './api.js';
import useHotkeys from './useHotkeys.js';
import { initialKey, nextKeyAfter, stepKey, upcomingUndecided } from './triageNav.js';
import Sidebar, { filterIssues, categoryColor } from './Sidebar.jsx';
import StatsPanel from './StatsPanel.jsx';
import IssueDetail from './IssueDetail.jsx';
import './Triage.css';

function storageKey(sessionId) {
  return `triage:${sessionId}:key`;
}

function relativeTime(iso) {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export default function Triage({ sessionId }) {
  const [session, setSession] = useState(null);
  const [issues, setIssues] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  const [currentKey, setCurrentKeyState] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);

  const [filter, setFilter] = useState('undecided');
  const [search, setSearch] = useState('');

  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toastTimer = useRef(null);
  const detailCache = useRef(new Map());
  const searchInputRef = useRef(null);

  const showToast = useCallback((text, error = false) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ text, error });
    toastTimer.current = setTimeout(() => setToast(null), 1500);
  }, []);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  const setCurrentKey = useCallback(
    (key) => {
      setCurrentKeyState(key);
      if (key) {
        try {
          window.localStorage.setItem(storageKey(sessionId), key);
        } catch {
          // ignore storage errors
        }
      }
    },
    [sessionId],
  );

  // Initial load
  useEffect(() => {
    let cancelled = false;
    detailCache.current = new Map();

    let savedKey = null;
    try {
      savedKey = window.localStorage.getItem(storageKey(sessionId));
    } catch {
      // ignore storage errors
    }

    Promise.all([api.getSession(sessionId), api.listIssues(sessionId), api.getStats(sessionId)])
      .then(([s, iss, st]) => {
        if (cancelled) return;
        setSession(s);
        setIssues(iss);
        setStats(st);
        setCurrentKeyState(initialKey(iss, savedKey));
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err.message);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const refetchStats = useCallback(() => {
    api
      .getStats(sessionId)
      .then((st) => setStats(st))
      .catch(() => {});
  }, [sessionId]);

  // Load detail for currentKey, prefetch upcoming
  useEffect(() => {
    if (!currentKey) return undefined;

    let cancelled = false;
    const cached = detailCache.current.get(currentKey);

    if (cached) {
      setDetail(cached);
      setDetailError(null);
      setDetailLoading(false);
    } else {
      setDetail(null);
      setDetailError(null);
      setDetailLoading(true);
      api
        .getIssueDetail(sessionId, currentKey)
        .then((d) => {
          if (cancelled) return;
          detailCache.current.set(currentKey, d);
          setDetail(d);
          setDetailLoading(false);
        })
        .catch((err) => {
          if (cancelled) return;
          setDetailError(err.message);
          setDetailLoading(false);
        });
    }

    const prefetchKeys = upcomingUndecided(issues, currentKey, 2);
    prefetchKeys.forEach((key) => {
      if (detailCache.current.has(key)) return;
      api
        .getIssueDetail(sessionId, key)
        .then((d) => {
          detailCache.current.set(key, d);
        })
        .catch(() => {});
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey, sessionId]);

  const handleDetailRefresh = useCallback(() => {
    if (!currentKey) return;
    const key = currentKey;
    setDetailLoading(true);
    api
      .getIssueDetail(sessionId, key, { refresh: true })
      .then((d) => {
        detailCache.current.set(key, d);
        if (key === currentKey) {
          setDetail(d);
          setDetailLoading(false);
        }
      })
      .catch((err) => {
        if (key === currentKey) {
          setDetailError(err.message);
          setDetailLoading(false);
        }
      });
  }, [currentKey, sessionId]);

  const categories = useMemo(() => session?.categories || [], [session]);
  const firstNonReject = categories.find((c) => !c.isReject);
  const rejectCategory = categories.find((c) => c.isReject);

  const currentIssue = useMemo(() => issues.find((i) => i.key === currentKey) || null, [issues, currentKey]);

  const filteredList = useMemo(() => filterIssues(issues, filter, search), [issues, filter, search]);

  const patchIssueDecision = useCallback((key, decision) => {
    setIssues((prev) => prev.map((i) => (i.key === key ? { ...i, decision } : i)));
  }, []);

  const openNote = useCallback(() => {
    setNote(currentIssue?.decision?.note || '');
    setNoteOpen(true);
  }, [currentIssue]);

  const decide = useCallback(
    async (categoryId) => {
      if (!currentKey || busy) return;
      setBusy(true);
      try {
        const res = await api.decide(sessionId, { issueKey: currentKey, categoryId, note });
        patchIssueDecision(currentKey, res.decision);
        setSession((s) => ({ ...s, ...res.session }));
        setNote('');
        if (res.warning) {
          showToast(res.warning, true);
        } else {
          const category = categories.find((c) => c.id === categoryId);
          showToast(`${currentKey} → ${category ? category.name : 'Decided'}`);
        }
        refetchStats();
        setIssues((updated) => {
          setCurrentKey(nextKeyAfter(updated, currentKey));
          return updated;
        });
      } catch (err) {
        showToast(err.message, true);
      } finally {
        setBusy(false);
      }
    },
    [currentKey, busy, note, sessionId, categories, patchIssueDecision, refetchStats, setCurrentKey, showToast],
  );

  const skip = useCallback(async () => {
    if (!currentKey || busy) return;
    setBusy(true);
    try {
      const res = await api.skip(sessionId, { issueKey: currentKey });
      patchIssueDecision(currentKey, res.decision);
      setSession((s) => ({ ...s, ...res.session }));
      refetchStats();
      setIssues((updated) => {
        setCurrentKey(nextKeyAfter(updated, currentKey));
        return updated;
      });
    } catch (err) {
      showToast(err.message, true);
    } finally {
      setBusy(false);
    }
  }, [currentKey, busy, sessionId, patchIssueDecision, refetchStats, setCurrentKey, showToast]);

  const clear = useCallback(async () => {
    if (!currentKey || busy) return;
    setBusy(true);
    try {
      await api.reopen(sessionId, currentKey);
      patchIssueDecision(currentKey, null);
      refetchStats();
    } catch (err) {
      showToast(err.message, true);
    } finally {
      setBusy(false);
    }
  }, [currentKey, busy, sessionId, patchIssueDecision, refetchStats, showToast]);

  const undo = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await api.undo(sessionId);
      setSession((s) => ({ ...s, ...res.session }));
      if (!res.issueKey) {
        showToast('Nothing to undo');
      } else {
        const [iss, st] = await Promise.all([api.listIssues(sessionId), api.getStats(sessionId)]);
        setIssues(iss);
        setStats(st);
        setCurrentKey(res.issueKey);
        showToast(`Undid ${res.issueKey}`, Boolean(res.warning));
      }
    } catch (err) {
      showToast(err.message, true);
    } finally {
      setBusy(false);
    }
  }, [busy, sessionId, setCurrentKey, showToast]);

  const handleJiraRefresh = useCallback(async () => {
    try {
      const result = await api.refresh(sessionId);
      const [iss, st] = await Promise.all([api.listIssues(sessionId), api.getStats(sessionId)]);
      setIssues(iss);
      setStats(st);
      setSession((s) => ({ ...s, ...result.session }));
      showToast(`${result.added} new`);
    } catch (err) {
      showToast(err.message, true);
    }
  }, [sessionId, showToast]);

  const handleToggleSyncLabels = useCallback(
    async (e) => {
      const next = e.target.checked;
      if (next) {
        const ok = window.confirm('This will add Jira labels to tickets as you decide. Continue?');
        if (!ok) return;
      }
      try {
        const updated = await api.updateSession(sessionId, { syncLabels: next });
        setSession((s) => ({ ...s, ...updated }));
      } catch (err) {
        showToast(err.message, true);
      }
    },
    [sessionId, showToast],
  );

  const jiraBase = useMemo(() => {
    const url = currentIssue?.url || '';
    const idx = url.indexOf('/browse/');
    return idx === -1 ? url : url.slice(0, idx);
  }, [currentIssue]);

  const onIssueKeyClick = useCallback(
    (key) => {
      if (issues.some((i) => i.key === key)) {
        setCurrentKey(key);
      } else if (jiraBase) {
        window.open(`${jiraBase}/browse/${key}`, '_blank', 'noopener');
      }
    },
    [issues, jiraBase, setCurrentKey],
  );

  const openInJira = useCallback(() => {
    if (currentIssue?.url) {
      window.open(currentIssue.url, '_blank', 'noopener');
    }
  }, [currentIssue]);

  const actionMap = {};
  categories.forEach((c) => {
    actionMap[c.hotkey] = () => decide(c.id);
  });
  actionMap.ArrowRight = () => firstNonReject && decide(firstNonReject.id);
  actionMap.ArrowLeft = () => rejectCategory && decide(rejectCategory.id);
  actionMap.s = () => skip();
  actionMap.Backspace = () => {
    if (currentIssue?.decision) clear();
  };
  actionMap.u = () => undo();
  actionMap['mod+z'] = () => undo();
  actionMap.n = () => openNote();
  actionMap.o = () => openInJira();

  const navMap = {
    j: () => setCurrentKey(stepKey(filteredList, currentKey, 1)),
    k: () => setCurrentKey(stepKey(filteredList, currentKey, -1)),
    '/': () => searchInputRef.current?.focus(),
    m: () => setStatsOpen((v) => !v),
    '?': () => setHelpOpen((v) => !v),
    Escape: () => {
      setNoteOpen(false);
      setHelpOpen(false);
      setStatsOpen(false);
      setSidebarOpen(false);
    },
  };

  useHotkeys(actionMap, !busy && !noteOpen);
  useHotkeys(navMap, !noteOpen);

  if (loading) {
    return (
      <div className="container">
        <div className="empty">Loading…</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="container">
        <div className="empty">Failed to load session: {loadError}</div>
      </div>
    );
  }

  const decision = currentIssue?.decision || null;
  let statusLine = 'Undecided';
  if (decision) {
    if (decision.status === 'skipped') {
      statusLine = 'Skipped';
    } else {
      const cat = categories.find((c) => c.id === decision.categoryId);
      statusLine = `Decided: ${cat ? cat.name : ''} · ${relativeTime(decision.decidedAt)}`;
    }
  }

  return (
    <div className="app">
      <div className="tri-topbar">
        <a className="btn btn-ghost" href="#/">← Sessions</a>
        <button type="button" className="btn btn-ghost tri-drawer-toggle" onClick={() => setSidebarOpen((v) => !v)}>
          ☰ Issues
        </button>
        <span className="tri-topbar-name">{session.name}</span>
        <StatsPanel stats={stats} categories={categories} compact />
        <span className="tri-topbar-spacer" />
        <div className="tri-topbar-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setStatsOpen(true)}>
            Metrics
          </button>
          <button type="button" className="btn btn-ghost" onClick={handleJiraRefresh}>
            Refresh
          </button>
          <a className="btn btn-ghost" href={`#/s/${sessionId}/results`}>Results</a>
          <label>
            <input type="checkbox" checked={Boolean(session.syncLabels)} onChange={handleToggleSyncLabels} />
            Write labels to Jira
          </label>
        </div>
      </div>

      <div className="tri-body">
        <div className="tri-sidebar-wrap">
          <Sidebar
            issues={issues}
            categories={categories}
            currentKey={currentKey}
            filter={filter}
            onFilterChange={setFilter}
            search={search}
            onSearchChange={setSearch}
            onSelect={setCurrentKey}
            searchInputRef={searchInputRef}
          />
        </div>

        {sidebarOpen && (
          <>
            <div className="tri-sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
            <div className="tri-sidebar-overlay">
              <Sidebar
                issues={issues}
                categories={categories}
                currentKey={currentKey}
                filter={filter}
                onFilterChange={setFilter}
                search={search}
                onSearchChange={setSearch}
                onSelect={(key) => {
                  setCurrentKey(key);
                  setSidebarOpen(false);
                }}
                searchInputRef={searchInputRef}
              />
            </div>
          </>
        )}

        <div className="tri-main">
          <div className="tri-scroll">
            <IssueDetail
              detail={currentKey ? detail : null}
              fallback={currentIssue}
              loading={currentKey ? detailLoading : false}
              error={currentKey ? detailError : null}
              onRefresh={handleDetailRefresh}
              onIssueKeyClick={onIssueKeyClick}
            />
          </div>

          <div className="tri-actionbar">
            <div className="tri-actionbar-status">
              {statusLine}
              {decision?.note && <div className="muted">📝 note</div>}
            </div>
            <div className="tri-actionbar-categories">
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`btn tri-cat-btn${decision?.categoryId === c.id && decision.status === 'decided' ? ' tri-active' : ''}`}
                  disabled={busy || !currentKey}
                  onClick={() => decide(c.id)}
                >
                  <span className="tri-cat-dot" style={{ background: categoryColor(c, categories) }} />
                  {c.name} <span className="kbd">{c.hotkey}</span>
                </button>
              ))}
              <button
                type="button"
                className={`btn${decision?.status === 'skipped' ? ' tri-active' : ''}`}
                disabled={busy || !currentKey}
                onClick={() => skip()}
              >
                Skip <span className="kbd">s</span>
              </button>
              {decision && (
                <button type="button" className="btn" disabled={busy || !currentKey} onClick={() => clear()}>
                  Clear <span className="kbd">⌫</span>
                </button>
              )}
            </div>
            <div className="tri-actionbar-right">
              <button type="button" className="btn" onClick={() => undo()}>
                Undo <span className="kbd">u</span>
              </button>
              <button type="button" className="btn" disabled={!currentKey} onClick={() => openNote()}>
                Note <span className="kbd">n</span>
              </button>
              <button type="button" className="btn" disabled={!currentKey} onClick={() => openInJira()}>
                Open in Jira <span className="kbd">o</span>
              </button>
              <button type="button" className="btn" onClick={() => setHelpOpen(true)}>
                Help <span className="kbd">?</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {toast && <div className={`toast${toast.error ? ' toast-error' : ''}`}>{toast.text}</div>}

      {noteOpen && (
        <div className="modal-backdrop" onClick={() => setNoteOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="form-row">
              <textarea
                autoFocus
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    setNoteOpen(false);
                  }
                }}
              />
            </div>
            <button type="button" className="btn-primary" onClick={() => setNoteOpen(false)}>
              Save note
            </button>
          </div>
        </div>
      )}

      {statsOpen && (
        <>
          <div className="tri-drawer-backdrop" onClick={() => setStatsOpen(false)} />
          <div className="tri-drawer">
            <StatsPanel stats={stats} categories={categories} compact={false} />
          </div>
        </>
      )}

      {helpOpen && (
        <div className="modal-backdrop" onClick={() => setHelpOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <table className="table">
              <tbody>
                {categories.map((c) => (
                  <tr key={c.id}>
                    <td className="kbd">{c.hotkey}</td>
                    <td>{c.name}</td>
                  </tr>
                ))}
                <tr>
                  <td className="kbd">→</td>
                  <td>First non-reject category</td>
                </tr>
                <tr>
                  <td className="kbd">←</td>
                  <td>Reject category</td>
                </tr>
                <tr>
                  <td className="kbd">s</td>
                  <td>Skip</td>
                </tr>
                <tr>
                  <td className="kbd">⌫</td>
                  <td>Clear decision</td>
                </tr>
                <tr>
                  <td className="kbd">u / mod+z</td>
                  <td>Undo</td>
                </tr>
                <tr>
                  <td className="kbd">j / k</td>
                  <td>Next / previous issue</td>
                </tr>
                <tr>
                  <td className="kbd">/</td>
                  <td>Focus search</td>
                </tr>
                <tr>
                  <td className="kbd">n</td>
                  <td>Note</td>
                </tr>
                <tr>
                  <td className="kbd">o</td>
                  <td>Open in Jira</td>
                </tr>
                <tr>
                  <td className="kbd">m</td>
                  <td>Metrics</td>
                </tr>
                <tr>
                  <td className="kbd">?</td>
                  <td>Toggle help</td>
                </tr>
                <tr>
                  <td className="kbd">Esc</td>
                  <td>Close dialogs</td>
                </tr>
              </tbody>
            </table>
            <p className="muted">Category hotkeys override these if they clash.</p>
          </div>
        </div>
      )}
    </div>
  );
}
