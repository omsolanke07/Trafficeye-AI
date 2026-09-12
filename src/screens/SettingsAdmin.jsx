import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';

export const SettingsAdmin = () => {
  const { apiFetch, showToast, currentUser } = useApp();
  const [activeTab, setActiveTab] = useState('users'); // 'users' | 'config' | 'audit'

  const [users, setUsers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [ocrThreshold, setOcrThreshold] = useState(85);
  const [autoDispatch, setAutoDispatch] = useState(false);
  const [soundAlerts, setSoundAlerts] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const loadAdminData = async () => {
      try {
        const [usersRes, cfgRes] = await Promise.all([
          apiFetch('/api/admin/users').catch(() => null),
          apiFetch('/api/admin/config').catch(() => null),
        ]);

        if (usersRes?.data) setUsers(usersRes.data);
        if (cfgRes?.data) {
          setOcrThreshold(parseInt(cfgRes.data.ocr_threshold || '85', 10));
          setSoundAlerts(cfgRes.data.sound_alerts === 'true');
          setAutoDispatch(cfgRes.data.auto_dispatch === 'true');
        }
      } catch (err) {
        console.error('[Admin] Error loading data:', err);
      }
    };
    loadAdminData();
  }, [apiFetch]);

  // Load audit logs when tab is clicked
  const loadAuditLogs = async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch('/api/audit-log?limit=50');
      if (res?.data) setAuditLogs(res.data);
    } catch (err) {
      showToast(`Audit log: ${err.message}`, 'warning');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleUserStatus = async (id) => {
    try {
      const res = await apiFetch(`/api/admin/users/${id}/status`, { method: 'PATCH' });
      setUsers(prev => prev.map(u => u.id === id ? res.data : u));
      showToast(`${res.data.name} status updated to ${res.data.status}`, 'info');
    } catch (err) {
      showToast(err.message, 'danger');
    }
  };

  const handleSaveConfig = async () => {
    try {
      await apiFetch('/api/admin/config', {
        method: 'POST',
        body: JSON.stringify({
          ocr_threshold: ocrThreshold,
          sound_alerts: soundAlerts,
          auto_dispatch: autoDispatch
        })
      });
      showToast('System configuration & parameters saved to database', 'success');
    } catch (err) {
      showToast(err.message, 'danger');
    }
  };

  return (
    <div className="screen active" id="screen-admin">
      <div className="breadcrumb">
        <span>Home</span>
        <span className="sep">/</span>
        <span>Settings / Admin</span>
      </div>

      <div className="page-head">
        <div>
          <div className="page-title">Settings &amp; Administration</div>
          <div className="page-sub">User roles, inference thresholds, and compliance audit records</div>
        </div>
        <div className="page-actions">
          <div className="map-toggle" style={{ position: 'static', boxShadow: 'none' }}>
            <button
              className={activeTab === 'users' ? 'active' : ''}
              onClick={() => setActiveTab('users')}
            >
              Access Roles
            </button>
            <button
              className={activeTab === 'config' ? 'active' : ''}
              onClick={() => setActiveTab('config')}
            >
              Inference Parameters
            </button>
            <button
              className={activeTab === 'audit' ? 'active' : ''}
              onClick={() => {
                setActiveTab('audit');
                loadAuditLogs();
              }}
            >
              Compliance Audit Log
            </button>
          </div>
        </div>
      </div>

      {/* TAB 1: USERS */}
      {activeTab === 'users' && (
        <div className="card">
          <div className="card-head">
            <h3>User Access Roles &amp; Station Assignments</h3>
            <span className="card-note">{users.length} authorized officers</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Officer Name</th>
                  <th>Role</th>
                  <th>Station</th>
                  <th>Access Level</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="mono">{u.username}</td>
                    <td style={{ fontWeight: 600 }}>{u.name}</td>
                    <td>{u.role}</td>
                    <td className="mono">{u.station}</td>
                    <td>{u.access_level}</td>
                    <td>
                      <span className={`badge badge-${u.status === 'Active' ? 'green' : 'red'}`}>
                        <span className="badge-dot"></span>
                        {u.status}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn btn-neutral btn-sm" onClick={() => toggleUserStatus(u.id)}>
                        {u.status === 'Active' ? 'Suspend' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: CONFIGURATION */}
      {activeTab === 'config' && (
        <div className="card">
          <div className="card-head">
            <h3>ANPR Inference &amp; Alert Engine Parameters</h3>
            <span className="card-note">Kernel v4.2.1-prod</span>
          </div>
          <div className="card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--slate)', display: 'block', marginBottom: '8px' }}>
                Minimum OCR Confidence Threshold ({ocrThreshold}%)
              </label>
              <input
                type="range"
                min="50"
                max="99"
                value={ocrThreshold}
                onChange={(e) => setOcrThreshold(e.target.value)}
                style={{ width: '100%' }}
              />
              <div style={{ fontSize: '11px', color: 'var(--meta)', marginTop: '4px' }}>
                Detections below {ocrThreshold}% confidence will be routed to manual review queue.
              </div>
            </div>

            <div>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--slate)', display: 'block', marginBottom: '8px' }}>
                High-Priority Blacklist Sound Alerts
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                <input
                  type="checkbox"
                  id="soundToggle"
                  checked={soundAlerts}
                  onChange={(e) => setSoundAlerts(e.target.checked)}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <label htmlFor="soundToggle" style={{ fontSize: '12.5px', cursor: 'pointer' }}>
                  Audible chime on Wanted / Stolen vehicle hit
                </label>
              </div>
            </div>

            <div>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--slate)', display: 'block', marginBottom: '8px' }}>
                Autonomous Patrol Unit Dispatch
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                <input
                  type="checkbox"
                  id="autoDispatchToggle"
                  checked={autoDispatch}
                  onChange={(e) => setAutoDispatch(e.target.checked)}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <label htmlFor="autoDispatchToggle" style={{ fontSize: '12.5px', cursor: 'pointer' }}>
                  Auto-assign nearest PCR van within 2 km
                </label>
              </div>
            </div>
          </div>
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" onClick={handleSaveConfig}>
              Save Configuration Parameters
            </button>
          </div>
        </div>
      )}

      {/* TAB 3: AUDIT LOG */}
      {activeTab === 'audit' && (
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Legal &amp; Compliance Audit Trail</h3>
              <div style={{ fontSize: '11px', color: 'var(--meta)', marginTop: '2px' }}>
                Immutable ledger of all officer plate queries, blacklist mutations, and dispatch orders
              </div>
            </div>
            <button className="btn btn-neutral btn-sm" onClick={loadAuditLogs} disabled={isLoading}>
              {isLoading ? 'Refreshing...' : 'Refresh Logs'}
            </button>
          </div>
          <div style={{ overflowX: 'auto', maxHeight: '420px' }}>
            <table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Officer</th>
                  <th>Action</th>
                  <th>Target Type</th>
                  <th>Target ID</th>
                  <th>Details</th>
                  <th>IP Address</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.length > 0 ? (
                  auditLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="mono" style={{ fontSize: '11px' }}>{log.timestamp}</td>
                      <td style={{ fontWeight: 600 }}>{log.username}</td>
                      <td>
                        <span className="badge badge-amber" style={{ fontFamily: 'var(--font-mono)' }}>
                          {log.action}
                        </span>
                      </td>
                      <td className="mono">{log.target_type}</td>
                      <td className="mono" style={{ fontWeight: 600 }}>{log.target_id || '—'}</td>
                      <td style={{ fontSize: '12px', color: 'var(--slate)' }}>{log.details || '—'}</td>
                      <td className="mono" style={{ fontSize: '11px' }}>{log.ip_address || '127.0.0.1'}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', color: 'var(--meta)', padding: '24px' }}>
                      {isLoading ? 'Loading audit records...' : 'No audit records found.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
