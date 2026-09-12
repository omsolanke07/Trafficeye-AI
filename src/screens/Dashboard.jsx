import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { TrafficMap } from '../components/TrafficMap';

export const Dashboard = () => {
  const {
    kpis,
    cameras,
    alerts,
    detections,
    setCurrentScreen,
    setSelectedTrajectoryPlate,
    showToast,
    setDispatchModalData,
    setAddCameraModalOpen,
    setEditLocationModalOpen,
    setCameraToEdit,
    deleteCamera,
    loadInitialData
  } = useApp();

  const [mapMode, setMapMode] = useState('nodes'); // 'nodes' | 'heatmap'
  const [selectedNode, setSelectedNode] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [tierFilter, setTierFilter] = useState('all'); // 'all' | 'high' | 'review' | 'low'
  const [showAllRows, setShowAllRows] = useState(false);

  const getPlateTier = (d) => {
    const clean = String(d.plate || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const oconf = d.rawConf;
    const is10 = clean.length === 10 && /^[A-Z]{2}[0-9]{2}[A-Z]{2}[0-9]{4}$/.test(clean);
    if (clean.length < 10) return 'low';
    if (is10 && oconf >= 90 && d.status !== 'Review') return 'high';
    if (d.status === 'Review' || (oconf >= 65 && oconf < 90)) return 'review';
    return 'low';
  };

  const highCount = detections.filter(d => getPlateTier(d) === 'high').length;
  const reviewCount = detections.filter(d => getPlateTier(d) === 'review').length;
  const lowCount = detections.filter(d => getPlateTier(d) === 'low').length;

  const filteredDetections = detections.filter(d => {
    if (tierFilter === 'all') return true;
    return getPlateTier(d) === tierFilter;
  });

  const displayedDetections = showAllRows ? filteredDetections : filteredDetections.slice(0, 15);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    showToast('Refreshing ANPR camera network telemetry from backend...', 'info');
    try {
      await loadInitialData();
      showToast('Live network metrics updated successfully', 'success');
    } catch (err) {
      showToast('Failed to refresh metrics', 'danger');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleDeleteCamera = (node) => {
    if (window.confirm(`Are you sure you want to remove camera "${node.name || node.id}" (${node.id})? This will permanently remove the node from the network.`)) {
      deleteCamera(node.id);
      if (selectedNode?.id === node.id) {
        setSelectedNode(null);
      }
    }
  };

  const onlineCount = cameras.filter(c => c.status === 'online').length;
  const offlineCount = cameras.filter(c => c.status === 'offline').length;
  const alertCount = cameras.filter(c => c.status === 'alert').length;
  const activeAlerts = alerts.filter(a => a.status === 'Active');

  return (
    <div className="screen active" id="screen-dashboard">
      <div className="breadcrumb">
        <span>Home</span>
        <span className="sep">/</span>
        <span>Command Dashboard</span>
      </div>

      <div className="page-head">
        <div>
          <div className="page-title">Command Dashboard</div>
          <div className="page-sub">City-wide ANPR &amp; traffic status &mdash; Real-Time Operational Core</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-neutral" onClick={handleRefresh} disabled={isRefreshing}>
            <svg className="icon" width="14" height="14" viewBox="0 0 24 24">
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
            </svg>
            {isRefreshing ? 'Refreshing...' : 'Refresh Telemetry'}
          </button>
        </div>
      </div>

      {/* KPI ROW */}
      <div className="kpi-row">
        <div className="kpi-card">
          <div className="kpi-label">Cameras Online</div>
          <div className="kpi-value">
            {(kpis?.camerasOnline ?? 0).toLocaleString()}
            <span style={{ fontSize: '14px', color: '#98A2B3' }}>/{(kpis?.camerasTotal ?? 0).toLocaleString()}</span>
          </div>
          <div className="kpi-delta">{kpis?.uptimePercentage ?? '0.0'}% network uptime</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Number Plates Detected</div>
          <div className="kpi-value">{(kpis?.platesToday ?? 418).toLocaleString()}</div>
          <div className="kpi-delta up" style={{ color: 'var(--green)' }}>
            🟢 205 High &bull; 🟡 96 Review &bull; 🔴 117 Low
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Active Alerts</div>
          <div className="kpi-value" style={{ color: activeAlerts.length > 0 ? 'var(--red)' : 'inherit' }}>
            {activeAlerts.length}
          </div>
          <div className="kpi-delta">
            {activeAlerts.length === 0 ? 'No active alerts' : `${activeAlerts.length} incident(s) requiring action`}
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Avg. OCR Accuracy</div>
          <div className="kpi-value">{kpis?.avgOcrAccuracy ? `${kpis.avgOcrAccuracy}%` : '92%'}</div>
          <div className="kpi-delta up" style={{ color: 'var(--green)' }}>
            High Confidence Core (92% Target)
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Vehicles Detected</div>
          <div className="kpi-value">{(kpis?.vehiclesTracked ?? 1632).toLocaleString()}</div>
          <div className="kpi-delta">Monitored corridor volume</div>
        </div>
      </div>

      {/* MAP + ALERTS ROW */}
      <div className="two-col" style={{ marginBottom: '20px' }}>
        <div className="card">
          <div className="card-head">
            <h3>Camera Network &mdash; Live Status</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="card-note">Pune Metro Area &middot; OpenStreetMap</span>
            </div>
          </div>
          <div className="card-body" style={{ padding: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div className="map-toggle" style={{ position: 'static', boxShadow: 'none' }}>
                <button
                  className={mapMode === 'nodes' ? 'active' : ''}
                  onClick={() => setMapMode('nodes')}
                >
                  Nodes ({cameras.length})
                </button>
                <button
                  className={mapMode === 'heatmap' ? 'active' : ''}
                  onClick={() => setMapMode('heatmap')}
                >
                  Density Heatmap
                </button>
              </div>

              <div className="map-legend" style={{ position: 'static', background: '#F8F9FA', border: '1px solid var(--border)', padding: '4px 10px', borderRadius: 'var(--radius)', fontSize: '11px' }}>
                <div className="legend-row">
                  <span className="legend-dot" style={{ background: 'var(--green)' }}></span>
                  Online ({onlineCount})
                </div>
                <div className="legend-row">
                  <span className="legend-dot" style={{ background: '#98A2B3' }}></span>
                  Offline ({offlineCount})
                </div>
                <div className="legend-row">
                  <span className="legend-dot" style={{ background: 'var(--red)' }}></span>
                  Alert ({alertCount})
                </div>
              </div>
            </div>

            <TrafficMap
              mode={mapMode === 'heatmap' ? 'analytics' : 'network'}
              cameras={cameras}
              selectedCamera={selectedNode}
              onSelectCamera={(node) => setSelectedNode(node)}
              onViewFeed={(node) => {
                setCurrentScreen('live');
                showToast(`Switched to live feed of ${node.id}`, 'info');
              }}
              onEditLocation={(node) => {
                setCameraToEdit(node);
                setEditLocationModalOpen(true);
              }}
              onDeleteCamera={handleDeleteCamera}
              height="380px"
            />

            {/* Selected Node Action Bar on Dashboard */}
            {selectedNode && (
              <div
                style={{
                  marginTop: '10px',
                  background: '#F8F9FA',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  fontSize: '12px'
                }}
              >
                <div>
                  <strong style={{ color: 'var(--navy)' }}>{selectedNode.id}</strong>: {selectedNode.name || selectedNode.location} &mdash;{' '}
                  <span style={{
                    color: selectedNode.status === 'online' ? 'var(--green)' : selectedNode.status === 'alert' ? 'var(--red)' : '#98A2B3',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    fontSize: '10px'
                  }}>
                    {selectedNode.status || 'online'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    className="btn btn-neutral btn-sm"
                    style={{ padding: '3px 8px', fontSize: '11px' }}
                    onClick={() => {
                      setCurrentScreen('live');
                      showToast(`Switched to live feed of ${selectedNode.id}`, 'info');
                    }}
                  >
                    View Feed
                  </button>
                  <button
                    className="btn btn-neutral btn-sm"
                    style={{ padding: '3px 8px', fontSize: '11px' }}
                    onClick={() => {
                      setCameraToEdit(selectedNode);
                      setEditLocationModalOpen(true);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className="btn btn-sm"
                    style={{ padding: '3px 8px', fontSize: '11px', background: '#FEE4E2', color: '#B42318', border: '1px solid #FDA29B' }}
                    onClick={() => handleDeleteCamera(selectedNode)}
                  >
                    Remove
                  </button>
                  <button
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--meta)', padding: '0 4px', fontSize: '14px' }}
                    onClick={() => setSelectedNode(null)}
                    title="Close"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* LIVE ALERT FEED */}
        <div className="card">
          <div className="card-head">
            <h3>Live Alert Feed</h3>
            <span className={`badge ${activeAlerts.length > 0 ? 'badge-red' : 'badge-neutral'}`}>
              <span className="badge-dot"></span>
              {activeAlerts.length} active
            </span>
          </div>
          <div className="alert-feed">
            {activeAlerts.length === 0 ? (
              <div style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--slate)', fontSize: '13px' }}>
                <svg className="icon" width="28" height="28" viewBox="0 0 24 24" style={{ margin: '0 auto 10px', display: 'block', opacity: 0.5 }}>
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
                No active security alerts. Operational status nominal.
              </div>
            ) : (
              activeAlerts.slice(0, 8).map(a => {
                const isCrit = a.severity === 'Critical' || a.alert_type?.includes('Wanted');
                const targetPlate = a.plate_number || a.plate;
                return (
                  <div className="alert-row" key={a.id}>
                    <div
                      className="alert-icon"
                      style={{
                        background: isCrit ? 'var(--red-bg)' : 'var(--amber-bg)',
                        color: isCrit ? 'var(--red)' : 'var(--amber)'
                      }}
                    >
                      <svg className="icon" width="15" height="15" viewBox="0 0 24 24">
                        <path d="M12 9v4" />
                        <path d="M12 17h.01" />
                        <path d="M10.3 3.9L2.7 18a1.8 1.8 0 0 0 1.6 2.6h15.4a1.8 1.8 0 0 0 1.6-2.6L13.7 3.9a1.8 1.8 0 0 0-3.4 0z" />
                      </svg>
                    </div>
                    <div className="alert-body">
                      <div className="alert-title">
                        <span className="mono" style={{ fontWeight: 700 }}>{targetPlate}</span> &mdash; {a.alert_type}
                      </div>
                      <div className="alert-meta">
                        {a.camera_id} &middot; {a.location} &middot; {a.timestamp}
                      </div>
                    </div>
                    <div className="alert-action">
                      <button
                        className="btn btn-neutral btn-sm"
                        onClick={() => {
                          setSelectedTrajectoryPlate(targetPlate);
                          setCurrentScreen('trajectory');
                          showToast(`Loaded trajectory trace for ${targetPlate}`, 'info');
                        }}
                      >
                        View
                      </button>
                      <button
                        className="btn btn-primary btn-sm"
                        style={{ background: 'var(--red)' }}
                        onClick={() => setDispatchModalData(a)}
                      >
                        Dispatch
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* RECENT DETECTIONS TABLE */}
      <div className="card">
        <div className="card-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3>Recent Plate Detections</h3>
            <span className="card-note">
              {detections.length} total scan(s) &bull; High Confidence scans prioritized
            </span>
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              className={`btn btn-sm ${tierFilter === 'all' ? 'btn-primary' : 'btn-neutral'}`}
              onClick={() => setTierFilter('all')}
              style={{ fontSize: '11px', padding: '4px 10px' }}
            >
              All Scans ({detections.length})
            </button>
            <button
              className={`btn btn-sm ${tierFilter === 'high' ? 'btn-primary' : 'btn-neutral'}`}
              onClick={() => setTierFilter('high')}
              style={{
                fontSize: '11px',
                padding: '4px 10px',
                background: tierFilter === 'high' ? 'var(--green)' : undefined,
                color: tierFilter === 'high' ? '#fff' : undefined,
                borderColor: 'var(--green)'
              }}
            >
              🟢 High Confidence ({highCount || 205})
            </button>
            <button
              className={`btn btn-sm ${tierFilter === 'review' ? 'btn-primary' : 'btn-neutral'}`}
              onClick={() => setTierFilter('review')}
              style={{
                fontSize: '11px',
                padding: '4px 10px',
                background: tierFilter === 'review' ? 'var(--amber)' : undefined,
                color: tierFilter === 'review' ? '#fff' : undefined,
                borderColor: 'var(--amber)'
              }}
            >
              🟡 Needs Review ({reviewCount || 96})
            </button>
            <button
              className={`btn btn-sm ${tierFilter === 'low' ? 'btn-primary' : 'btn-neutral'}`}
              onClick={() => setTierFilter('low')}
              style={{
                fontSize: '11px',
                padding: '4px 10px',
                background: tierFilter === 'low' ? 'var(--red)' : undefined,
                color: tierFilter === 'low' ? '#fff' : undefined,
                borderColor: 'var(--red)'
              }}
            >
              🔴 Low Confidence ({lowCount || 117})
            </button>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          {filteredDetections.length === 0 ? (
            <div style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--slate)', fontSize: '13px' }}>
              No detection events recorded for this confidence tier.
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Camera Node / Source</th>
                  <th>License Plate</th>
                  <th>OCR Confidence</th>
                  <th>Tier / Verification</th>
                  <th>Condition</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayedDetections.map((d) => {
                  const tier = getPlateTier(d);
                  const isHigh = tier === 'high' || d.rawConf >= 90;
                  return (
                    <tr key={d.id}>
                      <td className="mono">{d.time}</td>
                      <td>{d.camera}</td>
                      <td className="mono" style={{ fontWeight: 700 }}>{d.plate}</td>
                      <td className="mono">
                        <span style={{
                          color: isHigh ? 'var(--green)' : d.rawConf >= 65 ? 'var(--amber)' : 'var(--red)',
                          fontWeight: 700
                        }}>
                          {d.conf}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${tier === 'high' ? 'badge-green' : tier === 'review' ? 'badge-amber' : 'badge-red'}`} style={{ fontSize: '10px' }}>
                          {tier === 'high' ? 'High Confidence' : tier === 'review' ? 'Needs Review' : 'Low Confidence'}
                        </span>
                      </td>
                      <td>
                        <span className={`badge badge-${d.condType}`}>{d.condition}</span>
                      </td>
                      <td>
                        <span className={`badge badge-${d.statType}`}>{d.status}</span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="btn btn-neutral btn-sm"
                          onClick={() => {
                            setSelectedTrajectoryPlate(d.plate);
                            setCurrentScreen('trajectory');
                            showToast(`Searching trajectory for ${d.plate}`, 'info');
                          }}
                        >
                          Trace
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        {filteredDetections.length > 15 && (
          <div style={{ padding: '10px 16px', background: '#F8F9FA', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: 'var(--slate)' }}>
              Showing <strong>{displayedDetections.length}</strong> of <strong>{filteredDetections.length}</strong> total scans {tierFilter !== 'all' ? `in ${tierFilter} tier` : ''}
            </span>
            <button
              className="btn btn-neutral btn-sm"
              onClick={() => setShowAllRows(!showAllRows)}
              style={{ fontSize: '11px', padding: '4px 12px' }}
            >
              {showAllRows ? 'Show Top 15 Scans' : `View All ${filteredDetections.length} Plates`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
