import React, { useState, useEffect } from 'react';

export const Footer = () => {
  const [syncTime, setSyncTime] = useState('09-Sep-2026 14:32:11 IST');

  useEffect(() => {
    const updateSync = () => {
      const now = new Date();
      const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      const timeStr = now.toTimeString().split(' ')[0];
      setSyncTime(`${dateStr} ${timeStr} IST`);
    };
    const interval = setInterval(updateSync, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <footer className="app-footer">
      <span>Government of Maharashtra &middot; Directorate of Traffic Police &middot; Smart City Mission</span>
      <span>
        System v4.2.1 &middot; Restricted &mdash; For Authorized Personnel Only &middot; Last sync: {syncTime}
      </span>
    </footer>
  );
};
