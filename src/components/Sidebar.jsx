import React from 'react';
import { useApp } from '../context/AppContext';

export const Sidebar = () => {
  const { currentScreen, setCurrentScreen, alerts, blacklist } = useApp();

  const navItems = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: (
        <svg className="icon" width="17" height="17" viewBox="0 0 24 24">
          <rect x="3" y="3" width="7" height="9" />
          <rect x="14" y="3" width="7" height="5" />
          <rect x="14" y="12" width="7" height="9" />
          <rect x="3" y="16" width="7" height="5" />
        </svg>
      )
    },
    {
      id: 'live',
      label: 'Live ANPR Feed',
      icon: (
        <svg className="icon" width="17" height="17" viewBox="0 0 24 24">
          <rect x="2" y="6" width="15" height="12" rx="1" />
          <path d="M17 10l5-3v10l-5-3" />
        </svg>
      )
    },
    {
      id: 'anpr',
      label: 'ANPR Processor',
      icon: (
        <svg className="icon" width="17" height="17" viewBox="0 0 24 24">
          <rect x="3" y="7" width="18" height="10" rx="1" />
          <path d="M7 12h2m2 0h2m2 0h2" />
          <path d="M5 7V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2" />
        </svg>
      )
    },
    {
      id: 'trajectory',
      label: 'Plate Trajectory Search',
      icon: (
        <svg className="icon" width="17" height="17" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
      )
    },
    {
      id: 'analytics',
      label: 'Traffic Analytics',
      icon: (
        <svg className="icon" width="17" height="17" viewBox="0 0 24 24">
          <path d="M3 3v18h18" />
          <path d="M7 15l4-6 4 3 5-8" />
        </svg>
      )
    },
    {
      id: 'blacklist',
      label: 'Blacklist & Alerts',
      badge: alerts.length,
      icon: (
        <svg className="icon" width="17" height="17" viewBox="0 0 24 24">
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
          <path d="M10.3 3.9L2.7 18a1.8 1.8 0 0 0 1.6 2.6h15.4a1.8 1.8 0 0 0 1.6-2.6L13.7 3.9a1.8 1.8 0 0 0-3.4 0z" />
        </svg>
      )
    },
    {
      id: 'map',
      label: 'Camera Network Map',
      icon: (
        <svg className="icon" width="17" height="17" viewBox="0 0 24 24">
          <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
          <line x1="8" y1="2" x2="8" y2="18" />
          <line x1="16" y1="6" x2="16" y2="22" />
        </svg>
      )
    },
    {
      id: 'admin',
      label: 'Settings / Admin',
      icon: (
        <svg className="icon" width="17" height="17" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      )
    }
  ];

  return (
    <nav className="sidebar">
      <div>
        <div className="nav-list" id="navList">
          {navItems.map(item => (
            <button
              key={item.id}
              className={`nav-item ${currentScreen === item.id ? 'active' : ''}`}
              onClick={() => {
                setCurrentScreen(item.id);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.badge ? (
                <span className="nav-counter" style={{ background: '#FBE9E8', color: '#B3261E', fontWeight: 700 }}>
                  {item.badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>
      <div className="sidebar-foot">
        <div><strong>Build 4.2.1-gov</strong> &middot; Env: <strong>PROD</strong></div>
        <div style={{ marginTop: '3px' }}>Data classification: <strong>RESTRICTED</strong></div>
      </div>
    </nav>
  );
};
