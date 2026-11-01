/**
 * SensorCard – displays a single sensor's current reading.
 * Shows "Waiting for sensor data" if value is null/undefined.
 */
import { getSensorStatus, getSensorStatusLabel } from '../config/thresholds';

const STATUS_CLASSES = {
  normal: 'normal',
  warning: 'warning',
  danger: 'danger',
};

export default function SensorCard({ label, value, unit, icon: Icon, colorClass = 'blue', sensorKey }) {
  const hasData = value !== null && value !== undefined;
  const status = hasData && sensorKey ? getSensorStatus(sensorKey, value) : null;
  const statusLabel = hasData && sensorKey ? getSensorStatusLabel(sensorKey, value) : null;

  return (
    <div className="sensor-card" role="region" aria-label={label}>
      <div className="sensor-card-top">
        <div className={`sensor-icon-wrap ${colorClass}`} aria-hidden="true">
          {Icon && <Icon size={20} />}
        </div>

        {hasData && status ? (
          <div className={`sensor-status-chip ${STATUS_CLASSES[status]}`}>
            <span
              className="status-dot"
              style={{
                width: '6px',
                height: '6px',
                background:
                  status === 'normal'
                    ? 'var(--success-500)'
                    : status === 'warning'
                    ? 'var(--warning-500)'
                    : 'var(--danger-500)',
              }}
            />
            <span>{statusLabel}</span>
          </div>
        ) : (
          <div className="sensor-status-chip waiting">
            <span>No Data</span>
          </div>
        )}
      </div>

      {hasData ? (
        <div className="sensor-card-value">
          <span className="sensor-value-number" aria-label={`${value} ${unit}`}>
            {typeof value === 'number' ? value.toFixed(value % 1 === 0 ? 0 : 1) : value}
          </span>
          <span className="sensor-value-unit">{unit}</span>
        </div>
      ) : (
        <p className="sensor-waiting" aria-live="polite">
          Waiting for sensor data
        </p>
      )}

      <p className="sensor-card-label">{label}</p>
    </div>
  );
}
