import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

const AppContext = createContext();

export const AppProvider = ({ children }) => {
  const [currentScreen, setCurrentScreen] = useState('dashboard');
  const [feedPaused, setFeedPaused] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [selectedTrajectoryPlate, setSelectedTrajectoryPlate] = useState('MH 12 DE 4521');
  const [dispatchModalData, setDispatchModalData] = useState(null);
  const [addBlacklistModalOpen, setAddBlacklistModalOpen] = useState(false);
  const [addCameraModalOpen, setAddCameraModalOpen] = useState(false);
  const [editLocationModalOpen, setEditLocationModalOpen] = useState(false);
  const [cameraToEdit, setCameraToEdit] = useState(null);
  const [loginModalOpen, setLoginModalOpen] = useState(false);

  // Auth state
  const [token, setToken] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Backend state
  const [kpis, setKpis] = useState(null);
  const [cameras, setCameras] = useState([]);
  const [blacklist, setBlacklist] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [detections, setDetections] = useState([]);
  const [reports, setReports] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [systemConfig, setSystemConfig] = useState({ ocr_threshold: '85', sound_alerts: 'true', auto_dispatch: 'false' });

  // ANPR job state (keyed by jobId, values are latest WS event payloads)
  const [anprJobState, setAnprJobState] = useState({});

  const wsRef = useRef(null);

  // Toast Generator
  const showToast = (message, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  // Authenticated API Fetch Helper
  const apiFetch = useCallback(async (endpoint, options = {}) => {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const res = await fetch(endpoint, { ...options, headers });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || `HTTP ${res.status}: ${res.statusText}`);
      }
      return data;
    } catch (err) {
      console.error(`[API Error] ${endpoint}:`, err.message);
      throw err;
    }
  }, [token]);

  // Login handler
  const login = async (username, password) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.message || 'Invalid officer credentials');
      }

      setToken(data.data.token);
      setCurrentUser(data.data.user);
      setLoginModalOpen(false);
      showToast(`Authenticated as ${data.data.user.name} (${data.data.user.role})`, 'success');
      return data.data;
    } catch (err) {
      showToast(err.message, 'danger');
      throw err;
    }
  };

  // Logout handler
  const logout = () => {
    setToken(null);
    setCurrentUser(null);
    if (wsRef.current) {
      wsRef.current.close();
    }
    showToast('Officer session terminated. Please sign in.', 'info');
  };

  // Initial Auto-Login with demo commander account on first load
  useEffect(() => {
    const autoLogin = async () => {
      try {
        setAuthLoading(true);
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: 'deshmukh', password: 'police123' })
        });
        const data = await res.json();
        if (res.ok && data.data?.token) {
          setToken(data.data.token);
          setCurrentUser(data.data.user);
        }
      } catch (err) {
        console.warn('[Auth] Auto-login fallback to unauthenticated state:', err.message);
      } finally {
        setAuthLoading(false);
      }
    };
    autoLogin();
  }, []);

  // Fetch initial datasets once authenticated
  const loadInitialData = useCallback(async () => {
    if (!token) return;

    try {
      const [kpiRes, camRes, blRes, altRes, detRes, repRes, cfgRes] = await Promise.all([
        apiFetch('/api/kpis').catch(() => null),
        apiFetch('/api/cameras').catch(() => null),
        apiFetch('/api/blacklist').catch(() => null),
        apiFetch('/api/alerts?status=all').catch(() => null),
        apiFetch('/api/detections?limit=500').catch(() => null),
        apiFetch('/api/reports').catch(() => null),
        apiFetch('/api/admin/config').catch(() => null),
      ]);

      if (kpiRes?.data) setKpis(kpiRes.data);
      if (camRes?.data) setCameras(camRes.data);
      if (blRes?.data) setBlacklist(blRes.data);
      if (altRes?.data) setAlerts(altRes.data);
      if (detRes?.data?.items) {
        setDetections(detRes.data.items.map(d => {
          const oconf = Number(d.ocr_confidence);
          const confStr = !isNaN(oconf)
            ? (oconf <= 1.0 ? `${(oconf * 100).toFixed(1)}%` : `${oconf.toFixed(1)}%`)
            : '—';
          const rawConf = !isNaN(oconf) ? (oconf <= 1.0 ? oconf * 100 : oconf) : 0;
          return {
            id: d.id,
            time: d.timestamp,
            camera: d.camera_name || d.camera_id || 'Media Upload',
            plate: d.plate_number,
            conf: confStr,
            rawConf,
            condition: d.condition || 'Clear',
            condType: d.condition === 'Clear' ? 'green' : d.condition === 'Angled Plate' ? 'amber' : 'red',
            status: d.status,
            statType: d.status === 'Verified' ? 'green' : d.status === 'Flagged' ? 'red' : 'amber'
          };
        }));
      }
      if (repRes?.data) setReports(repRes.data);
      if (cfgRes?.data) setSystemConfig(cfgRes.data);
    } catch (err) {
      console.error('[AppContext] Failed to load data:', err);
    }
  }, [token, apiFetch]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Connect to Authenticated WebSocket
  useEffect(() => {
    if (!token) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?token=${token}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[WS] Connected to live ANPR telemetry server.');
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);

        if (payload.type === 'DETECTION') {
          if (!feedPaused) {
            const d = payload.data;
            const oconf = Number(d.ocr_confidence);
            const confStr = !isNaN(oconf)
              ? (oconf <= 1.0 ? `${(oconf * 100).toFixed(1)}%` : `${oconf.toFixed(1)}%`)
              : '—';
            const rawConf = !isNaN(oconf) ? (oconf <= 1.0 ? oconf * 100 : oconf) : 0;
            const formatted = {
              id: d.id || Date.now(),
              time: d.timestamp,
              camera: d.camera_name || d.camera_id || 'Media Upload',
              plate: d.plate_number,
              conf: confStr,
              rawConf,
              condition: d.condition || 'Clear',
              condType: d.condition === 'Clear' ? 'green' : d.condition === 'Angled Plate' ? 'amber' : 'red',
              status: d.status,
              statType: d.status === 'Verified' ? 'green' : d.status === 'Flagged' ? 'red' : 'amber'
            };
            setDetections(prev => [formatted, ...prev.filter(x => x.id !== formatted.id)].slice(0, 500));
          }
          // Refresh KPIs when real detection arrives
          apiFetch('/api/kpis').then(res => res?.data && setKpis(res.data)).catch(() => {});
        } else if (payload.type === 'ALERT') {
          const a = payload.data;
          setAlerts(prev => [a, ...prev.filter(x => x.id !== a.id)]);
          showToast(`ALERT: Blacklist match ${a.plate_number} at ${a.location}`, 'danger');
          apiFetch('/api/kpis').then(res => res?.data && setKpis(res.data)).catch(() => {});
        } else if (payload.type === 'ALERT_ACKNOWLEDGED' || payload.type === 'DISPATCH') {
          const updated = payload.data;
          setAlerts(prev => prev.map(a => a.id === updated.id ? updated : a));
        } else if (['JOB_QUEUED','JOB_STARTED','JOB_PROGRESS','JOB_COMPLETED','JOB_FAILED','JOB_CANCELLED'].includes(payload.type)) {
          const jobId = payload.data?.jobId;
          if (jobId) {
            setAnprJobState(prev => ({ ...prev, [jobId]: { type: payload.type, ...payload.data } }));
          }
        }
      } catch (err) {
        console.error('[WS Message Error]:', err);
      }
    };

    ws.onerror = (err) => {
      console.warn('[WS] Connection warning:', err);
    };

    ws.onclose = () => {
      console.log('[WS] Disconnected from telemetry server.');
    };

    return () => {
      ws.close();
    };
  }, [token, feedPaused]);

  // Camera Management Actions
  const addCamera = async (cameraData) => {
    try {
      const res = await apiFetch('/api/cameras', {
        method: 'POST',
        body: JSON.stringify(cameraData)
      });
      setCameras(prev => [...prev, res.data]);
      showToast(`Camera ${res.data.name} (${res.data.source_type}) registered`, 'success');
      loadInitialData(); // Refresh KPIs
      return res.data;
    } catch (err) {
      showToast(err.message, 'danger');
      throw err;
    }
  };

  const deleteCamera = async (id) => {
    try {
      await apiFetch(`/api/cameras/${id}`, { method: 'DELETE' });
      setCameras(prev => prev.filter(c => c.id !== id));
      showToast(`Camera ${id} removed`, 'info');
      loadInitialData(); // Refresh KPIs
    } catch (err) {
      showToast(err.message, 'danger');
    }
  };

  const updateCamera = async (id, updateData) => {
    try {
      const res = await apiFetch(`/api/cameras/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updateData)
      });
      setCameras(prev => prev.map(c => c.id === id ? res.data : c));
      showToast(`Camera ${res.data.name} updated successfully`, 'success');
      loadInitialData();
      return res.data;
    } catch (err) {
      showToast(err.message, 'danger');
      throw err;
    }
  };

  // Actions
  const addBlacklistEntry = async (entry) => {
    try {
      const res = await apiFetch('/api/blacklist', {
        method: 'POST',
        body: JSON.stringify({
          plate_number: entry.plate,
          reason: entry.reason,
          fir_ref: entry.fir_ref,
          added_by: entry.addedBy || currentUser?.name,
          category: entry.category || 'other',
          priority: entry.priority || 'Medium',
          notes: entry.notes || ''
        })
      });

      setBlacklist(prev => [res.data, ...prev]);
      showToast(`Plate ${entry.plate} registered in Blacklist`, 'success');
      loadInitialData(); // Refresh KPIs
      return res.data;
    } catch (err) {
      showToast(err.message, 'danger');
      throw err;
    }
  };

  const toggleBlacklistStatus = async (id) => {
    try {
      const res = await apiFetch(`/api/blacklist/${id}/status`, { method: 'PATCH' });
      setBlacklist(prev => prev.map(b => b.id === id ? res.data : b));
      showToast(`Plate ${res.data.plate_number} status: ${res.data.status}`, 'info');
    } catch (err) {
      showToast(err.message, 'danger');
    }
  };

  const acknowledgeAlert = async (alertId) => {
    try {
      const res = await apiFetch(`/api/alerts/${alertId}/acknowledge`, { method: 'PATCH' });
      setAlerts(prev => prev.map(a => a.id === alertId ? res.data : a));
      showToast(`Alert ${alertId} acknowledged`, 'info');
    } catch (err) {
      showToast(err.message, 'danger');
    }
  };

  const dispatchUnit = async (details) => {
    try {
      const res = await apiFetch(`/api/alerts/${details.id || 'ALT-901'}/dispatch`, {
        method: 'POST',
        body: JSON.stringify({
          patrol_unit: details.patrol_unit || 'PCR-18 (Hinjewadi Sector 7)',
          directive: details.directive || 'Intercept Safely'
        })
      });

      setAlerts(prev => prev.map(a => a.id === details.id ? res.data : a));
      setDispatchModalData(null);
      showToast(`Patrol unit dispatched for ${details.plate || details.plate_number}`, 'danger');
    } catch (err) {
      showToast(err.message, 'danger');
    }
  };

  const generateReport = async (name, type) => {
    try {
      showToast(`Generating official ${type} PDF...`, 'info');
      const res = await apiFetch('/api/reports/generate', {
        method: 'POST',
        body: JSON.stringify({ name, type })
      });
      setReports(prev => [res.data, ...prev]);
      showToast(`Report "${res.data.name}" certified & saved`, 'success');
      return res.data;
    } catch (err) {
      showToast(err.message, 'danger');
      throw err;
    }
  };

  return (
    <AppContext.Provider
      value={{
        currentScreen,
        setCurrentScreen,
        feedPaused,
        setFeedPaused,
        toasts,
        showToast,
        selectedTrajectoryPlate,
        setSelectedTrajectoryPlate,
        dispatchModalData,
        setDispatchModalData,
        addBlacklistModalOpen,
        setAddBlacklistModalOpen,
        addCameraModalOpen,
        setAddCameraModalOpen,
        editLocationModalOpen,
        setEditLocationModalOpen,
        cameraToEdit,
        setCameraToEdit,
        loginModalOpen,
        setLoginModalOpen,
        anprJobState,
        token,
        currentUser,
        login,
        logout,
        apiFetch,
        kpis,
        cameras,
        blacklist,
        alerts,
        detections,
        reports,
        systemConfig,
        auditLogs,
        addCamera,
        updateCamera,
        deleteCamera,
        addBlacklistEntry,
        toggleBlacklistStatus,
        acknowledgeAlert,
        dispatchUnit,
        generateReport,
        loadInitialData
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => useContext(AppContext);
