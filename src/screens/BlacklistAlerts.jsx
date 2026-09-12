import React, { useState } from 'react';
import { useApp } from '../context/AppContext';

export const BlacklistAlerts = () => {
  const {
    blacklist,
    alerts,
    setAddBlacklistModalOpen,
    setDispatchModalData,
    setSelectedTrajectoryPlate,
    setCurrentScreen,
    toggleBlacklistStatus,
    acknowledgeAlert
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  const filteredBlacklist = blacklist.filter(item => {
    const plate = item.plate_number || item.plate || '';
    const reason = item.reason || '';
    const addedBy = item.added_by || item.addedBy || '';

    const matchesSearch =
      plate.toLowerCase().includes(searchQuery.toLowerCase()) ||
      reason.toLowerCase().includes(searchQuery.toLowerCase()) ||
      addedBy.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'All' || item.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Top active critical alert
  const topCriticalAlert = alerts.find(a => a.status === 'Active' && (a.severity === 'Critical' || a.alert_type?.includes('Wanted') || a.typeColor === 'red'));

  return (
    <div className="screen active" id="screen-blacklist">
      <div className="breadcrumb">
        <span>Home</span>
        <span className="sep">/</span>
        <span>Blacklist &amp; Alerts</span>
      </div>

      {/* TOP URGENT ALERT BANNER */}
      {topCriticalAlert && (
        <div
          className="card"
          style={{
            borderColor: 'var(--red)',
            background: 'var(--red-bg)',
            marginBottom: '18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            boxShadow: '0 2px 8px rgba(179,38,30,0.1)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <svg className="icon" width="18" height="18" viewBox="0 0 24 24" style={{ color: 'var(--red)', flexShrink: 0 }}>
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
              <path d="M10.3 3.9L2.7 18a1.8 1.8 0 0 0 1.6 2.6h15.4a1.8 1.8 0 0 0 1.6-2.6L13.7 3.9a1.8 1.8 0 0 0-3.4 0z" />
            </svg>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--red)' }}>
                New match: <span className="mono">{topCriticalAlert.plate_number || topCriticalAlert.plate}</span> &mdash; {topCriticalAlert.alert_type || topCriticalAlert.type}
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--slate)' }}>
                Camera {topCriticalAlert.camera_id || topCriticalAlert.camera} &middot; {topCriticalAlert.location} &middot; {topCriticalAlert.timestamp || topCriticalAlert.time}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            <button
              className="btn btn-neutral btn-sm"
              onClick={() => acknowledgeAlert(topCriticalAlert.id)}
            >
              Acknowledge
            </button>
            <button
              className="btn btn-primary btn-sm"
              style={{ background: 'var(--red)' }}
              onClick={() => setDispatchModalData(topCriticalAlert)}
            >
              Dispatch Unit
            </button>
          </div>
        </div>
      )}

      {/* PAGE HEAD */}
      <div className="page-head">
        <div>
          <div className="page-title">Blacklist &amp; Alert Management</div>
          <div className="page-sub">Flagged vehicle registry, real-time alert dispatch, and compliance tracking</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => setAddBlacklistModalOpen(true)}>
            <svg className="icon" width="14" height="14" viewBox="0 0 24 24">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Blacklist Entry
          </button>
        </div>
      </div>

      {/* REGISTRY CARD */}
      <div className="card">
        <div className="card-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <h3>Flagged Vehicle Registry</h3>
            <span className="card-note">{filteredBlacklist.length} records shown</span>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Search plate or reason..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                padding: '6px 10px',
                fontSize: '12px',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                width: '180px'
              }}
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                padding: '6px 10px',
                fontSize: '12px',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                background: '#fff'
              }}
            >
              <option value="All">All Status</option>
              <option value="Active">Active</option>
              <option value="Resolved">Resolved</option>
            </select>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          {filteredBlacklist.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--slate)' }}>
              <svg className="icon" width="36" height="36" viewBox="0 0 24 24" style={{ margin: '0 auto 10px', display: 'block', opacity: 0.4 }}>
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--primary)', marginBottom: '4px' }}>
                No Blacklisted Vehicles Registered
              </div>
              <div style={{ fontSize: '12px', marginBottom: '12px' }}>
                Flagged vehicles will be checked automatically during real-time AI optical recognition.
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => setAddBlacklistModalOpen(true)}>
                Flag First Vehicle
              </button>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Plate Number</th>
                  <th>Category</th>
                  <th>Reason for Flag</th>
                  <th>Priority</th>
                  <th>Date Added</th>
                  <th>Added By</th>
                  <th>Status</th>
                  <th>Last Seen</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredBlacklist.map((item) => {
                  const targetPlate = item.plate_number || item.plate;
                  const lastSeenStr = item.last_seen_at || item.lastSeen || 'Pending';
                  return (
                    <tr key={item.id}>
                      <td
                        className="mono row-link"
                        onClick={() => {
                          setSelectedTrajectoryPlate(targetPlate);
                          setCurrentScreen('trajectory');
                        }}
                      >
                        {targetPlate}
                      </td>
                      <td>
                        <span className="badge badge-neutral" style={{ textTransform: 'capitalize' }}>
                          {item.category || 'Wanted'}
                        </span>
                      </td>
                      <td>{item.reason} {item.fir_ref ? `(FIR: ${item.fir_ref})` : ''}</td>
                      <td>
                        <span className={`badge ${item.priority === 'Critical' ? 'badge-red' : item.priority === 'High' ? 'badge-amber' : 'badge-green'}`}>
                          {item.priority || 'Medium'}
                        </span>
                      </td>
                      <td className="mono">{item.date_added || item.dateAdded}</td>
                      <td>{item.added_by || item.addedBy}</td>
                      <td>
                        {item.status === 'Active' ? (
                          <span className="badge badge-red">
                            <span className="badge-dot"></span>Active
                          </span>
                        ) : (
                          <span className="badge badge-green">
                            <span className="badge-dot"></span>Resolved
                          </span>
                        )}
                      </td>
                      <td>
                        {lastSeenStr.includes('·') ? (
                          <>
                            {lastSeenStr.split('·')[0]} &middot;{' '}
                            <span className="mono">{lastSeenStr.split('·')[1]}</span>
                          </>
                        ) : (
                          lastSeenStr
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="btn btn-neutral btn-sm"
                          onClick={() => toggleBlacklistStatus(item.id)}
                        >
                          {item.status === 'Active' ? 'Mark Resolved' : 'Reactivate'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
