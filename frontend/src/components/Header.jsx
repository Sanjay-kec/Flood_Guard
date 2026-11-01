import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Menu, Bell, Wifi, Bluetooth, Server, Cpu } from 'lucide-react';

const PAGE_META = {
  '/': {
    title: 'Dashboard',
    subtitle: 'System overview and current flood risk status',
  },
  '/live-monitoring': {
    title: 'Live Monitoring',
    subtitle: 'Real-time ESP32 sensor readings and trend charts',
  },
  '/flood-prediction': {
    title: 'Flood Prediction',
    subtitle: 'ML-powered flood risk prediction using sensor inputs',
  },
  '/alerts': {
    title: 'Alert Center',
    subtitle: 'Active alerts, history, and community notification system',
  },
  '/system-status': {
    title: 'System Status',
    subtitle: 'Component health and connectivity diagnostics',
  },
};

export default function Header({ onMenuToggle, apiStatus, sensorData }) {
  const location = useLocation();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const meta = PAGE_META[location.pathname] || {
    title: 'FloodGuard',
    subtitle: 'Flood Risk Monitoring System',
  };

  const esp32Status = sensorData ? 'connected' : 'disconnected';
  const btStatus = sensorData ? 'connected' : 'disconnected';

  const formatTime = (d) =>
    d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const formatDate = (d) =>
    d.toLocaleDateString('en-IN', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

  return (
    <header className="app-header" role="banner">
      <div className="header-inner">
        {/* Left: mobile menu + page title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', minWidth: 0 }}>
          <button
            className="header-icon-btn mobile-menu-btn"
            onClick={onMenuToggle}
            aria-label="Open navigation menu"
          >
            <Menu size={18} />
          </button>

          <div className="header-left">
            <h1 className="header-title">{meta.title}</h1>
            <p className="header-subtitle">{meta.subtitle}</p>
          </div>
        </div>

        {/* Right: status badges, datetime, bell */}
        <div className="header-right">
          <div className="header-status-badges" role="status" aria-label="Connection statuses">
            {/* ESP32 */}
            <div
              className={`status-badge ${esp32Status === 'connected' ? 'connected' : 'disconnected'}`}
              title={esp32Status === 'connected' ? 'ESP32 is sending data' : 'No data from ESP32'}
            >
              <Cpu size={11} aria-hidden="true" />
              <span>ESP32</span>
              <span
                className={`status-dot ${esp32Status === 'connected' ? 'online' : 'offline'}`}
                style={{ marginLeft: '2px' }}
              />
            </div>

            {/* Bluetooth */}
            <div
              className={`status-badge ${btStatus === 'connected' ? 'connected' : 'disconnected'}`}
              title={btStatus === 'connected' ? 'Bluetooth data received' : 'Bluetooth not connected'}
            >
              <Bluetooth size={11} aria-hidden="true" />
              <span>Bluetooth</span>
              <span
                className={`status-dot ${btStatus === 'connected' ? 'online' : 'offline'}`}
                style={{ marginLeft: '2px' }}
              />
            </div>

            {/* FastAPI */}
            <div
              className={`status-badge ${
                apiStatus === 'online'
                  ? 'connected'
                  : apiStatus === 'checking'
                  ? 'checking'
                  : 'disconnected'
              }`}
              title={
                apiStatus === 'online'
                  ? 'FastAPI is reachable'
                  : apiStatus === 'checking'
                  ? 'Checking FastAPI…'
                  : 'FastAPI is not reachable'
              }
            >
              <Server size={11} aria-hidden="true" />
              <span>FastAPI</span>
              <span
                className={`status-dot ${
                  apiStatus === 'online'
                    ? 'online'
                    : apiStatus === 'checking'
                    ? 'checking'
                    : 'offline'
                }`}
                style={{ marginLeft: '2px' }}
              />
            </div>
          </div>

          <div className="header-divider" aria-hidden="true" />

          <div className="header-datetime" aria-label="Current date and time">
            <span className="header-time">{formatTime(now)}</span>
            <span className="header-date">{formatDate(now)}</span>
          </div>

          <button
            className="header-icon-btn"
            aria-label="Notifications"
            title="Notifications"
          >
            <Bell size={17} />
          </button>
        </div>
      </div>
    </header>
  );
}
