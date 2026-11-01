import { NavLink, useLocation } from 'react-router-dom';
import {
  Droplets,
  LayoutDashboard,
  Activity,
  BrainCircuit,
  Bell,
  MonitorCheck,
  Wifi,
  Bluetooth,
  Server,
  AlertTriangle,
} from 'lucide-react';

const navItems = [
  {
    to: '/',
    icon: LayoutDashboard,
    label: 'Dashboard',
    exact: true,
  },
  {
    to: '/live-monitoring',
    icon: Activity,
    label: 'Live Monitoring',
  },
  {
    to: '/flood-prediction',
    icon: BrainCircuit,
    label: 'Flood Prediction',
  },
  {
    to: '/alerts',
    icon: Bell,
    label: 'Alerts',
  },
  {
    to: '/system-status',
    icon: MonitorCheck,
    label: 'System Status',
  },
];

export default function Sidebar({ isOpen, onClose, apiStatus }) {
  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="sidebar-overlay"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`app-sidebar${isOpen ? ' open' : ''}`}
        aria-label="Main navigation"
      >
        <div className="sidebar-inner">
          {/* Brand */}
          <div className="sidebar-brand" role="banner">
            <div className="sidebar-brand-icon" aria-hidden="true">
              <Droplets size={22} />
            </div>
            <div className="sidebar-brand-text">
              <span className="sidebar-brand-name">FloodGuard</span>
              <span className="sidebar-brand-sub">Flood Risk Monitoring</span>
            </div>
          </div>

          {/* Navigation */}
          <nav className="sidebar-nav" aria-label="Primary navigation">
            <span className="sidebar-section-label">Navigation</span>

            {navItems.map(({ to, icon: Icon, label, exact }) => (
              <NavLink
                key={to}
                to={to}
                end={exact}
                className={({ isActive }) =>
                  `sidebar-nav-item${isActive ? ' active' : ''}`
                }
                onClick={onClose}
                aria-current={({ isActive }) => (isActive ? 'page' : undefined)}
              >
                <Icon size={17} className="sidebar-nav-icon" aria-hidden="true" />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>

          {/* Footer – API status pill */}
          <div className="sidebar-footer">
            <div className="sidebar-status-pill" role="status" aria-live="polite">
              <span
                className={`status-dot ${
                  apiStatus === 'online'
                    ? 'online'
                    : apiStatus === 'checking'
                    ? 'checking'
                    : 'offline'
                }`}
              />
              <span style={{ fontSize: '12px' }}>
                {apiStatus === 'online'
                  ? 'FastAPI Connected'
                  : apiStatus === 'checking'
                  ? 'Checking API…'
                  : 'FastAPI Offline'}
              </span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
