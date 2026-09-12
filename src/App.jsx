import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { Footer } from './components/Footer';
import { Modals } from './components/Modals';
import { Dashboard } from './screens/Dashboard';
import { LiveFeed } from './screens/LiveFeed';
import { TrajectorySearch } from './screens/TrajectorySearch';
import { TrafficAnalytics } from './screens/TrafficAnalytics';
import { BlacklistAlerts } from './screens/BlacklistAlerts';
import { CameraNetworkMap } from './screens/CameraNetworkMap';
import { SettingsAdmin } from './screens/SettingsAdmin';
import { ANPRProcessor } from './screens/ANPRProcessor';

const MainContent = () => {
  const { currentScreen, toasts } = useApp();

  const renderScreen = () => {
    switch (currentScreen) {
      case 'dashboard':
        return <Dashboard />;
      case 'live':
        return <LiveFeed />;
      case 'anpr':
        return <ANPRProcessor />;
      case 'trajectory':
        return <TrajectorySearch />;
      case 'analytics':
        return <TrafficAnalytics />;
      case 'blacklist':
        return <BlacklistAlerts />;
      case 'map':
        return <CameraNetworkMap />;
      case 'admin':
        return <SettingsAdmin />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <>
      <main className="main" id="mainContent">
        {renderScreen()}
      </main>

      {/* Toast Notifications */}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.type}`}>
            <span style={{ fontWeight: 600 }}>&bull;</span>
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </>
  );
};

export default function App() {
  return (
    <AppProvider>
      <div className="app">
        <Header />
        <Sidebar />
        <MainContent />
        <Footer />
        <Modals />
      </div>
    </AppProvider>
  );
}
