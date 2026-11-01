/**
 * FloodStatus – prominent flood risk banner.
 * prediction: 0 → LOW RISK / NO FLOOD (green)
 * prediction: 1 → HIGH RISK / FLOOD RISK DETECTED (red)
 * prediction: null/undefined → unknown state (gray)
 *
 * Clearly distinguishes historical database records from live telemetry evaluations.
 */
import { ShieldCheck, AlertTriangle, HelpCircle, Clock, Zap, Loader2, Info, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function FloodStatus({
  prediction,
  timestamp,
  mode,
  status,
  message,
  isHistorical = false,
  sensorData = null,
  ledStatus = null,
  onEvaluate = null,
  isEvaluating = false,
  evalError = null,
  evalSuccess = null,
}) {
  const isHigh = prediction === 1;
  const isLow = prediction === 0;
  const isUnknown = prediction === null || prediction === undefined;

  const bannerClass = isHigh ? 'high' : isLow ? 'low' : 'unknown';
  const Icon = isHigh ? AlertTriangle : isLow ? ShieldCheck : HelpCircle;

  const formatTs = (ts) => {
    if (!ts) return null;
    try {
      return new Date(ts).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return ts;
    }
  };

  const isStale = Boolean(
    sensorData?.timestamp && Date.now() - new Date(sensorData.timestamp).getTime() > 30000
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div
        className={`flood-risk-banner ${bannerClass}`}
        role="alert"
        aria-live="assertive"
        aria-label={`Current flood risk assessment: ${isHigh ? 'HIGH FLOOD ALERT' : isLow ? 'NO FLOOD' : 'Status Unknown'}`}
      >
        <div className="flood-risk-icon-wrap" aria-hidden="true">
          <Icon size={34} />
        </div>

        <div className="flood-risk-content">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
            <p className="flood-risk-label" style={{ margin: 0 }}>
              {isHigh ? '⚠ Random Forest Flood Risk' : isLow ? 'Random Forest Flood Risk' : 'Flood Risk Assessment'}
            </p>
            {isHistorical ? (
              <span
                className="tag tag-gray"
                style={{ fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '0.4px' }}
                title="This status was loaded from past MySQL history and has not been re-evaluated on current telemetry"
              >
                Historical Database Record
              </span>
            ) : mode === 'telemetry_eval' ? (
              <span
                className="tag tag-blue"
                style={{ fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '0.4px', background: '#e0f2fe', color: '#0369a1' }}
              >
                Live Telemetry Evaluation
              </span>
            ) : mode === 'auto' ? (
              <span
                className="tag tag-blue"
                style={{ fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '0.4px' }}
              >
                Live Auto-Model
              </span>
            ) : mode === 'manual' ? (
              <span
                className="tag tag-amber"
                style={{ fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '0.4px' }}
              >
                Manual Simulation
              </span>
            ) : null}

            {ledStatus && (
              <span
                style={{
                  fontSize: '10.5px',
                  fontWeight: '600',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  backgroundColor: (!ledStatus.receiver_connected || ledStatus.hardware_state === 'UNKNOWN')
                    ? '#f1f5f9'
                    : !ledStatus.synced
                    ? '#fef3c7'
                    : ledStatus.hardware_state === 'ON'
                    ? '#fee2e2'
                    : '#dcfce7',
                  color: (!ledStatus.receiver_connected || ledStatus.hardware_state === 'UNKNOWN')
                    ? '#64748b'
                    : !ledStatus.synced
                    ? '#b45309'
                    : ledStatus.hardware_state === 'ON'
                    ? '#b91c1c'
                    : '#15803d',
                  border: `1px solid ${
                    (!ledStatus.receiver_connected || ledStatus.hardware_state === 'UNKNOWN')
                      ? '#cbd5e1'
                      : !ledStatus.synced
                      ? '#fde68a'
                      : ledStatus.hardware_state === 'ON'
                      ? '#fca5a5'
                      : '#86efac'
                  }`,
                }}
                title={
                  !ledStatus.receiver_connected
                    ? 'Bluetooth receiver is disconnected'
                    : !ledStatus.synced
                    ? `Syncing to ${ledStatus.target_command || 'command'}... (Awaiting ESP32 hardware ACK)`
                    : ledStatus.hardware_state === 'UNKNOWN'
                    ? 'Hardware acknowledgment missing or outdated'
                    : `Confirmed via physical ESP32 GPIO 23 ACK (${ledStatus.hardware_state})`
                }
              >
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: (!ledStatus.receiver_connected || ledStatus.hardware_state === 'UNKNOWN')
                      ? '#94a3b8'
                      : !ledStatus.synced
                      ? '#f59e0b'
                      : ledStatus.hardware_state === 'ON'
                      ? '#ef4444'
                      : '#22c55e',
                    boxShadow:
                      ledStatus.receiver_connected && ledStatus.synced && ledStatus.hardware_state === 'ON'
                        ? '0 0 6px #ef4444'
                        : 'none',
                  }}
                />
                <span>
                  ESP32 LED:{' '}
                  {!ledStatus.receiver_connected
                    ? 'HARDWARE STATUS UNKNOWN (Receiver Offline)'
                    : !ledStatus.synced
                    ? `SYNCING (${ledStatus.target_command || 'COMMAND'})`
                    : ledStatus.hardware_state === 'UNKNOWN'
                    ? 'HARDWARE STATUS UNKNOWN'
                    : ledStatus.hardware_state === 'ON'
                    ? 'ON (GPIO 23)'
                    : 'OFF (GPIO 23)'}
                </span>
              </span>
            )}
          </div>

          <h2 className="flood-risk-title">
            {isHigh ? (status || 'HIGH FLOOD ALERT') : isLow ? (status || 'NO FLOOD') : 'Risk Level Unknown'}
          </h2>

          <p className="flood-risk-desc">
            {isHigh
              ? (message || 'High flood alert! Elevated water level and rainfall conditions detected.')
              : isLow
              ? (message || 'No flood conditions detected based on environmental readings.')
              : 'No prediction has been run yet. Submit sensor values or evaluate current telemetry to assess risk.'}
          </p>

          {isHistorical && (
            <div
              style={{
                marginTop: '8px',
                padding: '6px 10px',
                background: 'rgba(0, 0, 0, 0.04)',
                borderRadius: '6px',
                fontSize: '11.5px',
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Info size={13} style={{ flexShrink: 0, color: 'var(--primary-600)' }} aria-hidden="true" />
              <span>
                <strong>Historical Snapshot:</strong> Recorded on {formatTs(timestamp)}. Not yet evaluated against current live ESP32 readings (Rain: {sensorData?.rainfall !== undefined ? `${sensorData.rainfall} mm` : '—'}, Water: {sensorData?.water_level !== undefined ? `${sensorData.water_level} m` : '—'}).
              </span>
            </div>
          )}
        </div>

        <div className="flood-risk-meta">
          {!isUnknown && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '6px 14px',
                borderRadius: '9999px',
                fontSize: '12px',
                fontWeight: '700',
                letterSpacing: '0.5px',
                textTransform: 'uppercase',
                background: isHigh ? 'var(--danger-100)' : 'var(--success-100)',
                color: isHigh ? 'var(--danger-700)' : 'var(--success-700)',
              }}
            >
              {isHigh ? 'HIGH FLOOD ALERT' : 'NO FLOOD'}
            </span>
          )}

          {timestamp && (
            <p className="flood-risk-time" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Clock size={12} aria-hidden="true" />
              <span>{isHistorical ? 'Recorded:' : 'Evaluated:'} {formatTs(timestamp)}</span>
            </p>
          )}

          {onEvaluate && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={onEvaluate}
              disabled={isEvaluating}
              style={{
                marginTop: '6px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                padding: '7px 12px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              }}
              title="Run active Random Forest model using the latest live ESP32 telemetry"
            >
              {isEvaluating ? (
                <>
                  <Loader2 size={13} className="spin" aria-hidden="true" />
                  <span>Evaluating...</span>
                </>
              ) : (
                <>
                  <Zap size={13} aria-hidden="true" />
                  <span>Evaluate Current ESP32 Telemetry</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Telemetry Status Notices */}
      {isStale && (
        <div
          style={{
            padding: '8px 12px',
            background: 'var(--warning-50)',
            border: '1px solid var(--warning-100)',
            borderRadius: '6px',
            fontSize: '12px',
            color: 'var(--warning-700)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
          role="status"
        >
          <AlertCircle size={14} style={{ flexShrink: 0 }} aria-hidden="true" />
          <span>
            <strong>Warning:</strong> Live ESP32 telemetry is stale (&gt;30s since last Bluetooth packet). Current conditions may have changed.
          </span>
        </div>
      )}

      {!sensorData && (
        <div
          style={{
            padding: '8px 12px',
            background: '#f8fafc',
            border: '1px solid var(--border-medium)',
            borderRadius: '6px',
            fontSize: '12px',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
          role="status"
        >
          <Info size={14} style={{ flexShrink: 0 }} aria-hidden="true" />
          <span>
            No live ESP32 telemetry connected. Waiting for serial data on COM9.
          </span>
        </div>
      )}

      {evalSuccess && (
        <div
          style={{
            padding: '8px 12px',
            background: 'var(--success-50)',
            border: '1px solid var(--success-100)',
            borderRadius: '6px',
            fontSize: '12px',
            color: 'var(--success-700)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
          role="status"
        >
          <CheckCircle2 size={14} style={{ flexShrink: 0 }} aria-hidden="true" />
          <span>{evalSuccess}</span>
        </div>
      )}

      {evalError && (
        <div
          style={{
            padding: '8px 12px',
            background: 'var(--danger-50)',
            border: '1px solid var(--danger-100)',
            borderRadius: '6px',
            fontSize: '12px',
            color: 'var(--danger-700)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
          role="alert"
        >
          <AlertCircle size={14} style={{ flexShrink: 0 }} aria-hidden="true" />
          <span>{evalError}</span>
        </div>
      )}
    </div>
  );
}
