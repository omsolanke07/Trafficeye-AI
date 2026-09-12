import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';

export const Header = () => {
  const {
    alerts,
    currentUser,
    token,
    logout,
    setLoginModalOpen,
    showToast,
    setCurrentScreen,
    setSelectedTrajectoryPlate
  } = useApp();

  const [showNotifications, setShowNotifications] = useState(false);
  const [liveTime, setLiveTime] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setLiveTime(now.toTimeString().split(' ')[0] + ' IST');
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const activeAlertCount = alerts.filter(a => a.status === 'Active').length;

  return (
    <header className="top-header">
      <div className="header-left">
        <div className="emblem">TE</div>
        <div className="header-titles">
          <span className="platform-name">TrafficEye AI</span>
          <span className="dept-sub">Directorate of Traffic Police &middot; Smart City Mission, Sector Control</span>
        </div>
      </div>

      <div className="header-right">
        <div className="live-indicator">
          <span className="live-indicator-dot"></span>
          <span>SYSTEM LIVE &middot; {liveTime || '14:32:00 IST'}</span>
        </div>

        <div style={{ position: 'relative' }}>
          <button
            className="icon-btn"
            title="Notifications"
            onClick={() => setShowNotifications(!showNotifications)}
          >
            <svg className="icon" width="18" height="18" viewBox="0 0 24 24">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {activeAlertCount > 0 && <span className="bell-count">{activeAlertCount}</span>}
          </button>

          {/* Notifications Dropdown Drawer */}
          {showNotifications && (
            <div className="notification-popover">
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontWeight: 600, fontSize: '13px' }}>Active Security Alerts ({activeAlertCount})</div>
                <button
                  style={{ background: 'transparent', color: 'var(--meta)', fontSize: '11px', cursor: 'pointer' }}
                  onClick={() => setShowNotifications(false)}
                >
                  Close
                </button>
              </div>
              <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
                {alerts.map(a => (
                  <div
                    key={a.id}
                    style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.15s' }}
                    onClick={() => {
                      setSelectedTrajectoryPlate(a.plate_number || a.plate);
                      setCurrentScreen('trajectory');
                      setShowNotifications(false);
                      showToast(`Opened trajectory tracker for ${a.plate_number || a.plate}`, 'info');
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#F7F8FA'}
                    onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: '12.5px' }}>{a.plate_number || a.plate}</span>
                      <span className={`badge badge-${a.severity === 'Critical' ? 'red' : 'amber'}`}>{a.alert_type || a.type}</span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--meta)', marginTop: '2px' }}>{a.location}</div>
                    <div style={{ fontSize: '10px', color: '#98A2B3', fontFamily: 'var(--font-mono)' }}>{a.timestamp || a.time}</div>
                  </div>
                ))}
              </div>
              <div style={{ padding: '8px 14px', background: '#FAFBFC', borderTop: '1px solid var(--border)', textAlign: 'center' }}>
                <button
                  className="row-link"
                  style={{ border: 'none', background: 'transparent' }}
                  onClick={() => {
                    setCurrentScreen('blacklist');
                    setShowNotifications(false);
                  }}
                >
                  View All Flagged Alerts &rarr;
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="header-divider"></div>

        {currentUser ? (
          <>
            <div className="op-block">
              <span className="op-name">{currentUser.name}</span>
              <span className="op-meta">Station: {currentUser.station} &middot; {currentUser.role}</span>
            </div>
            <button
              className="logout-link"
              style={{ background: 'transparent', cursor: 'pointer' }}
              onClick={() => setLoginModalOpen(true)}
              title="Switch Officer or Log out"
            >
              Switch Officer
            </button>
          </>
        ) : (
          <button
            className="btn btn-outline btn-sm"
            style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.4)', background: 'transparent' }}
            onClick={() => setLoginModalOpen(true)}
          >
            Officer Sign In
          </button>
        )}
      </div>
    </header>
  );
};
