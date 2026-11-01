/**
 * StatusCard – compact system component status card used on Dashboard and System Status.
 */

const STATUS_STYLES = {
  connected: {
    iconBg: 'var(--success-50)',
    iconColor: 'var(--success-600)',
    dotClass: 'online',
    label: 'Connected',
    labelColor: 'var(--success-700)',
  },
  ready: {
    iconBg: 'var(--success-50)',
    iconColor: 'var(--success-600)',
    dotClass: 'online',
    label: 'Ready',
    labelColor: 'var(--success-700)',
  },
  disconnected: {
    iconBg: 'var(--danger-50)',
    iconColor: 'var(--danger-600)',
    dotClass: 'offline',
    label: 'Not Connected',
    labelColor: 'var(--danger-700)',
  },
  unavailable: {
    iconBg: 'var(--danger-50)',
    iconColor: 'var(--danger-600)',
    dotClass: 'offline',
    label: 'Unavailable',
    labelColor: 'var(--danger-700)',
  },
  checking: {
    iconBg: 'var(--warning-50)',
    iconColor: 'var(--warning-600)',
    dotClass: 'checking',
    label: 'Checking…',
    labelColor: 'var(--warning-700)',
  },
  not_configured: {
    iconBg: '#f1f5f9',
    iconColor: 'var(--text-secondary)',
    dotClass: 'unknown',
    label: 'Not Configured',
    labelColor: 'var(--text-secondary)',
  },
};

export default function StatusCard({ label, description, status, icon: Icon, lastUpdate }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.checking;

  return (
    <div className="status-card" role="region" aria-label={`${label} status`}>
      <div
        className="status-card-icon"
        style={{ background: style.iconBg, color: style.iconColor }}
        aria-hidden="true"
      >
        {Icon && <Icon size={20} />}
      </div>

      <div className="status-card-info">
        <p className="status-card-label">{label}</p>
        <p className="status-card-value" style={{ color: style.labelColor, display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span className={`status-dot ${style.dotClass}`} />
          {style.label}
        </p>
        {description && <p className="status-card-desc">{description}</p>}
        {lastUpdate && (
          <p className="status-card-desc" style={{ marginTop: '4px' }}>
            Last checked: {lastUpdate}
          </p>
        )}
      </div>
    </div>
  );
}
