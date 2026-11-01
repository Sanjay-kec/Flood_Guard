/**
 * AlertCard – displays a single alert entry in alert history list.
 */
import { AlertTriangle, ShieldCheck, Clock, MapPin } from 'lucide-react';

export default function AlertCard({ alert }) {
  const isHigh = alert.riskLevel === 1 || alert.riskLevel === 'high';

  const formatTs = (ts) => {
    try {
      return new Date(ts).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return ts;
    }
  };

  return (
    <div
      className={`alert-banner ${isHigh ? 'high' : 'low'}`}
      role="article"
      aria-label={`Alert: ${isHigh ? 'High Risk' : 'Low Risk'} at ${formatTs(alert.timestamp)}`}
    >
      <div className="alert-banner-icon" aria-hidden="true">
        {isHigh ? <AlertTriangle size={22} /> : <ShieldCheck size={22} />}
      </div>

      <div className="alert-banner-content">
        <div className={`alert-banner-tag ${isHigh ? 'high' : 'low'}`}>
          {isHigh ? 'HIGH RISK ALERT' : 'ALL CLEAR'}
        </div>

        <p className="alert-banner-title">
          {isHigh ? 'High Flood Risk Detected' : 'No Flood Risk Detected'}
        </p>

        <p className="alert-banner-details">
          {isHigh
            ? 'ML model returned prediction = 1 (Flood). Sensor conditions exceeded monitoring thresholds. Follow official emergency guidance.'
            : 'ML model returned prediction = 0 (No Flood). Conditions are within acceptable monitoring parameters.'}
        </p>

        <div className="alert-banner-meta">
          {alert.timestamp && (
            <div className="alert-meta-item">
              <span className="alert-meta-label">
                <Clock size={9} style={{ display: 'inline', marginRight: '3px' }} aria-hidden="true" />
                Time
              </span>
              <span className="alert-meta-value">{formatTs(alert.timestamp)}</span>
            </div>
          )}

          {(alert.latitude || alert.location) && (
            <div className="alert-meta-item">
              <span className="alert-meta-label">
                <MapPin size={9} style={{ display: 'inline', marginRight: '3px' }} aria-hidden="true" />
                Location
              </span>
              <span className="alert-meta-value">
                {alert.location || `${alert.latitude?.toFixed(4)}, ${alert.longitude?.toFixed(4)}`}
              </span>
            </div>
          )}

          {alert.status && (
            <div className="alert-meta-item">
              <span className="alert-meta-label">Status</span>
              <span className="alert-meta-value">{alert.status}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
