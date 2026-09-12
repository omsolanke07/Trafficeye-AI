import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { TrafficMap } from '../components/TrafficMap';

export const CameraNetworkMap = () => {
  const {
    cameras,
    setCurrentScreen,
    setAddCameraModalOpen,
    setEditLocationModalOpen,
    setCameraToEdit,
    deleteCamera,
    showToast
  } = useApp();

  const [filter, setFilter] = useState('all'); // 'all' | 'online' | 'offline' | 'alert'
  const [activeNode, setActiveNode] = useState(null);

  const onlineCount = cameras.filter(n => n.status === 'online').length;
  const offlineCount = cameras.filter(n => n.status === 'offline').length;
  const alertCount = cameras.filter(n => n.status === 'alert').length;

  const visibleCameras = cameras.filter(n => {
    if (filter === 'all') return true;
    if (filter === 'online') return n.status === 'online';
    if (filter === 'offline') return n.status === 'offline';
    if (filter === 'alert') return n.status === 'alert';
    return true;
  });

  const handleEditLocation = (node) => {
    setCameraToEdit(node);
    setEditLocationModalOpen(true);
  };

  const handleViewFeed = (node) => {
    setCurrentScreen('live');
    showToast(`Viewing live feed for ${node.name}`, 'info');
  };

  const handleDeleteCamera = (node) => {
    if (window.confirm(`Are you sure you want to remove camera "${node.name}" (${node.id})? This will permanently remove the node from the network.`)) {
      deleteCamera(node.id);
      if (activeNode?.id === node.id) {
        setActiveNode(null);
      }
    }
  };

  return (
    <div className="screen active" id="screen-map">
      <div className="breadcrumb">
        <span>Home</span>
        <span className="sep">/</span>
        <span>Camera Network Map</span>
      </div>

      <div className="page-head">
        <div>
          <div className="page-title">Camera Network Map &mdash; Pune City Command</div>
          <div className="page-sub">Interactive OpenStreetMap Node Inventory &amp; Geolocation Core</div>
        </div>
        <div className="page-actions">
          <div className="map-toggle" style={{ position: 'static', boxShadow: 'none' }}>
            <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
              All ({cameras.length})
            </button>
            <button className={filter === 'online' ? 'active' : ''} onClick={() => setFilter('online')}>
              Online ({onlineCount})
            </button>
            <button className={filter === 'offline' ? 'active' : ''} onClick={() => setFilter('offline')}>
              Offline ({offlineCount})
            </button>
            <button className={filter === 'alert' ? 'active' : ''} onClick={() => setFilter('alert')}>
              Alert Zones ({alertCount})
            </button>
          </div>
          <button className="btn btn-primary" onClick={() => setAddCameraModalOpen(true)}>
            <svg className="icon" width="14" height="14" viewBox="0 0 24 24">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Camera
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: activeNode ? '1fr 340px' : '1fr', gap: '20px' }}>
        <div className="card">
          <div className="card-body" style={{ padding: '12px' }}>
            {/* Status Legend Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div className="map-legend" style={{ position: 'static', background: '#F8F9FA', border: '1px solid var(--border)', padding: '6px 14px', borderRadius: 'var(--radius)' }}>
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
                  Alert Zone ({alertCount})
                </div>
              </div>

              <div style={{ fontSize: '11px', color: 'var(--meta)' }}>
                Showing {visibleCameras.length} of {cameras.length} camera nodes &middot; OpenStreetMap Pune
              </div>
            </div>

            {/* REAL LEAFLET + OPENSTREETMAP COMPONENT */}
            <TrafficMap
              mode="network"
              cameras={visibleCameras}
              selectedCamera={activeNode}
              onSelectCamera={(node) => {
                setActiveNode(node);
                showToast(`Selected Node: ${node.id} (${node.name})`, 'info');
              }}
              onViewFeed={handleViewFeed}
              onEditLocation={handleEditLocation}
              onDeleteCamera={handleDeleteCamera}
              height="540px"
            />
          </div>
        </div>

        {/* Selected Node Details Sidebar */}
        {activeNode && (
          <div className="card">
            <div className="card-head">
              <h3>Node Telemetry</h3>
              <button
                className="icon-btn"
                style={{ color: 'var(--meta)' }}
                onClick={() => setActiveNode(null)}
              >
                ✕
              </button>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ background: '#F8F9FA', padding: '10px 12px', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '11px', color: 'var(--meta)' }}>Camera Node ID</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '14px', color: 'var(--primary)' }}>
                  {activeNode.id}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--slate)', marginTop: '2px', fontWeight: 600 }}>
                  {activeNode.name}
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '6px 0', borderBottom: '1px solid #EEF1F5' }}>
                  <span style={{ color: 'var(--meta)' }}>Source Type:</span>
                  <span className="mono" style={{ fontWeight: 600 }}>{activeNode.source_type || 'local_stream'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '6px 0', borderBottom: '1px solid #EEF1F5' }}>
                  <span style={{ color: 'var(--meta)' }}>Status:</span>
                  <span className={`badge badge-${activeNode.status === 'online' ? 'green' : activeNode.status === 'alert' ? 'red' : 'neutral'}`}>
                    {activeNode.status}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '6px 0', borderBottom: '1px solid #EEF1F5' }}>
                  <span style={{ color: 'var(--meta)' }}>Location:</span>
                  <span>{activeNode.location || activeNode.ward || 'Standard Sector'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '6px 0', borderBottom: '1px solid #EEF1F5' }}>
                  <span style={{ color: 'var(--meta)' }}>Coordinates:</span>
                  <span className="mono" style={{ fontWeight: 600, color: 'var(--primary)' }}>
                    {parseFloat(activeNode.lat || 0).toFixed(4)}, {parseFloat(activeNode.lng || 0).toFixed(4)}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '6px 0', borderBottom: '1px solid #EEF1F5' }}>
                  <span style={{ color: 'var(--meta)' }}>Resolution:</span>
                  <span>{activeNode.resolution || '1080p'} @ {activeNode.fps || 30}fps</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '6px 0' }}>
                  <span style={{ color: 'var(--meta)' }}>Last Sighted Plate:</span>
                  <span className="mono" style={{ fontWeight: 600 }}>{activeNode.last_plate || 'None recorded'}</span>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                <button
                  className="btn btn-neutral"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => handleEditLocation(activeNode)}
                >
                  <svg className="icon" width="14" height="14" viewBox="0 0 24 24">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="none" stroke="currentColor" strokeWidth="2"/>
                    <circle cx="12" cy="9" r="3" fill="none" stroke="currentColor" strokeWidth="2"/>
                  </svg>
                  Edit Camera Location
                </button>

                <button
                  className="btn btn-primary"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => handleViewFeed(activeNode)}
                >
                  Open Stream Feed
                </button>

                <button
                  className="btn btn-neutral"
                  style={{ width: '100%', justifyContent: 'center', color: 'var(--red)', borderColor: '#FCA5A5' }}
                  onClick={() => handleDeleteCamera(activeNode)}
                >
                  <svg className="icon" width="14" height="14" viewBox="0 0 24 24">
                    <polyline points="3 6 5 6 21 6" stroke="currentColor" fill="none" strokeWidth="2" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" fill="none" strokeWidth="2" />
                  </svg>
                  Remove Camera Node
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CameraNetworkMap;
