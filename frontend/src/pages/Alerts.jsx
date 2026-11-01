/**
 * Alerts Page
 *
 * DATA SOURCES (corrected architecture):
 *   sensorData     → ESP32 (temperature, humidity, rainfall, water_level only)
 *   systemLocation → Computer (latitude, longitude, elevation)
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Bell,
  ShieldCheck,
  AlertTriangle,
  MessageSquare,
  Clock,
  Info,
  CheckCircle2,
  XCircle,
  Monitor,
  Cpu,
  Send,
  Lock,
  Smartphone,
  RefreshCw,
  Zap,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { getSmsStatus, getSmsHistory, sendTestSms } from '../services/api';

export default function Alerts({
  lastPrediction,
  alertHistory,
  sensorData,
  systemLocation,
  ledStatus = null,
  onEvaluateTelemetry,
  isEvaluatingTelemetry = false,
  evalTelemetryError = null,
  evalTelemetrySuccess = null,
}) {
  const hasPrediction = lastPrediction !== null && lastPrediction !== undefined;
  const isHigh = lastPrediction?.prediction === 1;

  // ── SMS Gateway State ────────────────────────────────────────────────────────
  const [smsStatus, setSmsStatus] = useState(null);
  const [smsLogs, setSmsLogs] = useState([]);
  const [smsLoading, setSmsLoading] = useState(false);
  const [smsActionMsg, setSmsActionMsg] = useState(null);
  const [smsError, setSmsError] = useState(null);

  const fetchSmsData = useCallback(async () => {
    try {
      const [statusData, historyData] = await Promise.all([
        getSmsStatus(),
        getSmsHistory(20),
      ]);
      setSmsStatus(statusData);
      setSmsLogs(historyData || []);
    } catch {
      // Ignore background fetch errors
    }
  }, []);

  useEffect(() => {
    fetchSmsData();
    const timer = setInterval(fetchSmsData, 10000);
    return () => clearInterval(timer);
  }, [fetchSmsData]);

  const handleSendTestSms = async () => {
    if (smsLoading) return;
    setSmsLoading(true);
    setSmsActionMsg(null);
    setSmsError(null);

    try {
      const res = await sendTestSms({
        note: 'Triggered from FloodGuard React Alerts page',
      });
      if (res && res.success) {
        setSmsActionMsg(
          `Test SMS dispatched successfully via Twilio! SID: ${res.provider_message_id || res.sid || 'N/A'}`
        );
        fetchSmsData();
      } else {
        setSmsError(res?.error || 'Twilio dispatch failed. Check backend logs and credentials.');
      }
    } catch (err) {
      const detail = err?.response?.data?.detail || err?.message || 'Error triggering test SMS.';
      setSmsError(detail);
    } finally {
      setSmsLoading(false);
    }
  };

  const formatTs = (ts) => {
    if (!ts) return '—';
    try {
      const d = new Date(ts);
      if (isNaN(d.getTime())) return String(ts);
      return d.toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      });
    } catch { return String(ts); }
  };

  return (
    <main id="main-content" aria-label="Alert Center">
      <div className="stack">

        {/* ── Current Alert ─────────────────────────────── */}
        <section aria-labelledby="current-alert-heading">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
            <div className="section-title" id="current-alert-heading" style={{ marginBottom: 0 }}>
              <Bell size={15} aria-hidden="true" />
              Current Alert Status
            </div>

            {onEvaluateTelemetry && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={onEvaluateTelemetry}
                disabled={isEvaluatingTelemetry}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                }}
                title="Run active Random Forest model using the latest live ESP32 telemetry"
              >
                {isEvaluatingTelemetry ? (
                  <>
                    <Loader2 size={13} className="spin" aria-hidden="true" />
                    <span>Evaluating Telemetry...</span>
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

          {evalTelemetrySuccess && (
            <div
              style={{
                padding: '10px 14px',
                marginBottom: '12px',
                background: 'var(--success-50)',
                border: '1px solid var(--success-100)',
                borderRadius: '8px',
                fontSize: '12.5px',
                color: 'var(--success-700)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
              role="status"
            >
              <CheckCircle2 size={15} style={{ flexShrink: 0 }} aria-hidden="true" />
              <span>{evalTelemetrySuccess}</span>
            </div>
          )}

          {evalTelemetryError && (
            <div
              style={{
                padding: '10px 14px',
                marginBottom: '12px',
                background: 'var(--danger-50)',
                border: '1px solid var(--danger-100)',
                borderRadius: '8px',
                fontSize: '12.5px',
                color: 'var(--danger-700)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
              role="alert"
            >
              <AlertCircle size={15} style={{ flexShrink: 0 }} aria-hidden="true" />
              <span>{evalTelemetryError}</span>
            </div>
          )}

          {hasPrediction ? (
            <div
              className={`alert-banner ${isHigh ? 'high' : 'low'}`}
              role="alert"
              aria-live="polite"
            >
              <div className={`alert-banner-icon ${isHigh ? 'high' : 'low'}`} aria-hidden="true">
                {isHigh ? <AlertTriangle size={24} /> : <ShieldCheck size={24} />}
              </div>

              <div className="alert-banner-content">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                  <div className={`alert-banner-tag ${isHigh ? 'high' : 'low'}`} style={{ marginBottom: 0 }}>
                    {lastPrediction?.status || (isHigh ? 'HIGH FLOOD ALERT' : 'NO FLOOD')}
                  </div>
                  {lastPrediction?.isHistorical ? (
                    <span className="tag tag-gray" title="Loaded from past MySQL history; not evaluated on live telemetry">
                      Historical Database Record
                    </span>
                  ) : lastPrediction?.mode === 'telemetry_eval' ? (
                    <span className="tag tag-blue" style={{ background: '#e0f2fe', color: '#0369a1' }}>
                      Live Telemetry Evaluation
                    </span>
                  ) : lastPrediction?.mode === 'auto' ? (
                    <span className="tag tag-blue">
                      Live Auto-Model
                    </span>
                  ) : lastPrediction?.mode === 'manual' ? (
                    <span className="tag tag-amber">
                      Manual Simulation
                    </span>
                  ) : null}

                  {ledStatus && (
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: '600',
                        padding: '3px 9px',
                        borderRadius: '6px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
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
                          width: '7px',
                          height: '7px',
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

                <p className="alert-banner-title">
                  {lastPrediction?.status || (isHigh ? 'HIGH FLOOD ALERT' : 'NO FLOOD')}
                </p>

                <p className="alert-banner-details">
                  {lastPrediction?.message ||
                    (isHigh
                      ? 'High flood alert! Elevated water level and rainfall conditions detected.'
                      : 'No flood conditions detected based on environmental readings.')}
                </p>

                {lastPrediction?.isHistorical && (
                  <div
                    style={{
                      marginTop: '8px',
                      marginBottom: '10px',
                      padding: '8px 12px',
                      background: 'rgba(0, 0, 0, 0.04)',
                      borderRadius: '6px',
                      fontSize: '12px',
                      color: 'var(--text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <Info size={14} style={{ flexShrink: 0, color: 'var(--primary-600)' }} aria-hidden="true" />
                    <span>
                      <strong>Historical Record:</strong> Showing stored prediction recorded at {formatTs(lastPrediction.timestamp)}. This was not evaluated on current live ESP32 telemetry. Click "Evaluate Current ESP32 Telemetry" to test against current sensor readings.
                    </span>
                  </div>
                )}

                <div className="alert-banner-meta">
                  {lastPrediction?.timestamp && (
                    <div className="alert-meta-item">
                      <span className="alert-meta-label">
                        {lastPrediction?.isHistorical ? 'Historical Run Time' : 'Evaluation Time'}
                      </span>
                      <span className="alert-meta-value">{formatTs(lastPrediction.timestamp)}</span>
                    </div>
                  )}

                  {/* Model inputs used during this prediction run */}
                  {lastPrediction?.inputs?.temperature !== undefined && (
                    <div className="alert-meta-item">
                      <span className="alert-meta-label" style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <Cpu size={9} aria-hidden="true" />
                        Temperature (Model Input)
                      </span>
                      <span className="alert-meta-value">{lastPrediction.inputs.temperature} °C</span>
                    </div>
                  )}

                  {lastPrediction?.inputs?.water_level !== undefined && (
                    <div className="alert-meta-item">
                      <span className="alert-meta-label" style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <Cpu size={9} aria-hidden="true" />
                        Water Level (Model Input)
                      </span>
                      <span className="alert-meta-value">{lastPrediction.inputs.water_level} m</span>
                    </div>
                  )}

                  {lastPrediction?.inputs?.rainfall !== undefined && (
                    <div className="alert-meta-item">
                      <span className="alert-meta-label" style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <Cpu size={9} aria-hidden="true" />
                        Rainfall (Model Input)
                      </span>
                      <span className="alert-meta-value">{lastPrediction.inputs.rainfall} mm</span>
                    </div>
                  )}

                  {/* System location */}
                  {(lastPrediction?.inputs?.latitude != null || systemLocation?.latitude != null) && (
                    <div className="alert-meta-item">
                      <span className="alert-meta-label" style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <Monitor size={9} aria-hidden="true" />
                        Location (System)
                      </span>
                      <span className="alert-meta-value">
                        {Number(lastPrediction?.inputs?.latitude ?? systemLocation?.latitude ?? 0).toFixed(4)}°,{' '}
                        {Number(lastPrediction?.inputs?.longitude ?? systemLocation?.longitude ?? 0).toFixed(4)}°
                      </span>
                    </div>
                  )}
                </div>

                {isHigh && (
                  <div
                    style={{
                      marginTop: '12px', padding: '10px 14px',
                      background: 'var(--danger-100)', borderRadius: '8px',
                      fontSize: '12.5px', color: 'var(--danger-700)', fontWeight: '500',
                    }}
                  >
                    ⚠ Experimental Prototype Output: This system provides automated telemetry and prototype ML model classifications. It is not an official civil flood warning and must not substitute for official directives from local disaster management authorities.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div
              style={{
                background: '#f8fafc',
                border: '1px dashed var(--border-medium)',
                borderRadius: '12px',
                padding: '40px',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: '12px', textAlign: 'center',
              }}
              role="status"
            >
              <div
                style={{
                  width: '52px', height: '52px', background: '#e2e8f0',
                  borderRadius: '50%', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)',
                }}
                aria-hidden="true"
              >
                <Bell size={22} />
              </div>
              <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                No Prediction Run Yet
              </p>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '320px' }}>
                Click "Evaluate Current ESP32 Telemetry" or go to Flood Prediction to run the ML model.
              </p>
            </div>
          )}

          {/* ── Live Telemetry Card ── */}
          <div
            className="card"
            style={{
              marginTop: '12px',
              padding: '14px 18px',
              border: '1px solid var(--border-light)',
              background: '#ffffff',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Cpu size={15} style={{ color: sensorData ? 'var(--primary-600)' : 'var(--text-muted)' }} />
                <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-heading)' }}>
                  Live ESP32 Telemetry (COM9 Stream)
                </span>
                <span className={`tag ${sensorData ? 'tag-green' : 'tag-gray'}`} style={{ fontSize: '10.5px' }}>
                  {sensorData ? 'CONNECTED' : 'DISCONNECTED'}
                </span>
              </div>

              {sensorData?.timestamp && (
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Latest packet: {formatTs(sensorData.timestamp)}
                </span>
              )}
            </div>

            {sensorData ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                  gap: '12px',
                  marginTop: '12px',
                }}
              >
                <div style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: '6px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Rainfall</div>
                  <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-heading)' }}>
                    {sensorData.rainfall !== undefined ? `${sensorData.rainfall} mm` : '—'}
                  </div>
                </div>
                <div style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: '6px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Water Level</div>
                  <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-heading)' }}>
                    {sensorData.water_level !== undefined ? `${sensorData.water_level} m` : '—'}
                  </div>
                </div>
                <div style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: '6px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Temperature</div>
                  <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-heading)' }}>
                    {sensorData.temperature !== undefined ? `${sensorData.temperature} °C` : '—'}
                  </div>
                </div>
                <div style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: '6px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Humidity</div>
                  <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-heading)' }}>
                    {sensorData.humidity !== undefined ? `${sensorData.humidity} %` : '—'}
                  </div>
                </div>
              </div>
            ) : (
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px', marginBottom: 0 }}>
                No live sensor telemetry received yet. Run <code>python bluetooth/receiver.py</code> on COM9 to stream readings.
              </p>
            )}
          </div>
        </section>

        {/* ── Alert History ──────────────────────────────── */}
        <section aria-labelledby="alert-history-heading">
          <div className="section-title" id="alert-history-heading">
            <Clock size={15} aria-hidden="true" />
            Alert History
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">Session Alert Log</span>
              <span
                style={{
                  fontSize: '11.5px', color: 'var(--text-muted)',
                  background: '#f1f5f9', padding: '3px 10px', borderRadius: '99px',
                }}
              >
                {alertHistory?.length ?? 0} record(s)
              </span>
            </div>

            <div style={{ padding: '16px 20px' }}>
              {alertHistory && alertHistory.length > 0 ? (
                <>
                  <div className="table-wrap">
                    <table className="data-table" aria-label="Alert history table">
                      <thead>
                        <tr>
                          <th scope="col">#</th>
                          <th scope="col">Date &amp; Time</th>
                          <th scope="col">Origin</th>
                          <th scope="col">Model Risk Level</th>
                          <th scope="col">Prediction</th>
                          <th scope="col" title="Input snapshot used for this model run">Temp (Model Input)</th>
                          <th scope="col" title="Input snapshot used for this model run">Water Level (Model Input)</th>
                          <th scope="col" title="Input snapshot used for this model run">Rainfall (Model Input)</th>
                          <th scope="col" title="System-configured location">Location (System)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {alertHistory.map((entry, idx) => (
                          <tr key={idx}>
                            <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{idx + 1}</td>
                            <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                              {formatTs(entry.timestamp)}
                            </td>
                            <td>
                              <span className={`tag ${entry.mode === 'telemetry_eval' ? 'tag-blue' : entry.mode === 'auto' ? 'tag-blue' : entry.mode === 'manual' ? 'tag-amber' : 'tag-gray'}`}>
                                {entry.mode === 'telemetry_eval' ? 'TELEMETRY' : entry.mode === 'auto' ? 'AUTO' : entry.mode === 'manual' ? 'MANUAL' : 'LOG'}
                              </span>
                            </td>
                            <td>
                              <span className={`tag ${entry.prediction === 1 ? 'tag-red' : 'tag-green'}`}>
                                {entry.status || (entry.prediction === 1 ? 'HIGH FLOOD ALERT' : 'NO FLOOD')}
                              </span>
                            </td>
                            <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                              {entry.prediction === 1 ? '1 (HIGH FLOOD ALERT)' : '0 (NO FLOOD)'}
                            </td>
                            <td>
                              {entry.inputs?.temperature != null ? `${entry.inputs.temperature} °C` : '—'}
                            </td>
                            <td>
                              {entry.inputs?.water_level != null ? `${entry.inputs.water_level} m` : '—'}
                            </td>
                            <td>
                              {entry.inputs?.rainfall != null ? `${entry.inputs.rainfall} mm` : '—'}
                            </td>
                            <td style={{ fontSize: '11.5px' }}>
                              {entry.inputs?.latitude != null && entry.inputs?.longitude != null
                                ? `${Number(entry.inputs.latitude).toFixed(3)}°, ${Number(entry.inputs.longitude).toFixed(3)}°`
                                : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '12px' }}>
                    Note: This log displays historical ML prediction input snapshots captured at the time each prediction was executed. Current live ESP32 telemetry is shown in the Live Telemetry card above and Live Monitoring page. Alert history is persistently stored in the MySQL database and preserved across sessions.
                  </p>
                </>
              ) : (
                <div className="table-empty" role="status">
                  No alert history available.
                  <br />
                  <span style={{ fontSize: '12px' }}>
                    History is recorded when predictions are run during this session.
                  </span>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ── Community SMS Alert System (Mock / Twilio Modes) ─────────────────── */}
        <section aria-labelledby="community-alert-heading">
          <div className="section-title" id="community-alert-heading">
            <MessageSquare size={15} aria-hidden="true" />
            {smsStatus?.is_mock ? 'Mock SMS Alert Gateway (Free Simulator)' : 'Twilio Community SMS Alert System'}
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Smartphone size={15} aria-hidden="true" />
                {smsStatus?.is_mock ? 'Mock Gateway & Simulated Safety Controls' : 'Twilio Gateway & Safety Controls'}
              </span>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                {smsStatus?.is_mock ? (
                  <span className="tag tag-blue" style={{ fontWeight: 700 }}>
                    MOCK MODE — NO REAL SMS SENT
                  </span>
                ) : smsStatus?.ready ? (
                  <span className="tag tag-green">Twilio Ready</span>
                ) : (
                  <span className="tag tag-amber">Pending .env</span>
                )}
                <span className="tag tag-gray" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Lock size={11} aria-hidden="true" />
                  Broadcast Locked
                </span>
              </div>
            </div>

            <div className="card-body">
              {/* Notice Banner */}
              {smsStatus?.is_mock ? (
                <div
                  style={{
                    background: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    borderRadius: '8px',
                    padding: '12px 16px',
                    fontSize: '12.5px',
                    color: '#1e40af',
                    marginBottom: '20px',
                    display: 'flex',
                    gap: '10px',
                  }}
                  role="note"
                >
                  <Info size={16} style={{ flexShrink: 0, marginTop: '2px' }} aria-hidden="true" />
                  <div>
                    <strong>MOCK MODE — NO REAL SMS SENT:</strong> You are using the completely free local SMS provider. Test dispatches are simulated entirely in-app and recorded in the MySQL audit log. Zero external SMS APIs are called, zero network requests are made, and no phone charges or Twilio upgrades apply.
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    background: smsStatus?.ready ? 'var(--success-50, #f0fdf4)' : 'var(--info-50)',
                    border: `1px solid ${smsStatus?.ready ? 'var(--success-200, #bbf7d0)' : 'var(--info-100)'}`,
                    borderRadius: '8px',
                    padding: '12px 16px',
                    fontSize: '12.5px',
                    color: smsStatus?.ready ? 'var(--success-700, #15803d)' : 'var(--info-600)',
                    marginBottom: '20px',
                    display: 'flex',
                    gap: '10px',
                  }}
                  role="note"
                >
                  <Info size={14} style={{ flexShrink: 0, marginTop: '2px' }} aria-hidden="true" />
                  <div>
                    <strong>Safety First Architecture:</strong> All SMS dispatches are locked in <code>DEMO_MODE</code> and strictly restricted to your explicitly verified mobile number. Community-wide broadcasts remain disabled to prevent accidental mass messaging.
                  </div>
                </div>
              )}

              {/* Status Grid */}
              <div className="grid-2" style={{ marginBottom: '20px' }}>
                <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '10px', border: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="info-label">Gateway Provider</span>
                    <span className="info-value" style={{ fontWeight: 600 }}>
                      {smsStatus?.is_mock ? 'Mock SMS Simulator (Free Local)' : 'Twilio REST API'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="info-label">Sender Virtual Line</span>
                    <span className="info-value" style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                      {smsStatus?.from_number || (smsStatus?.is_mock ? '+1 (555) 000-MOCK' : 'Not Configured')}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="info-label">Operational Mode</span>
                    <span className={`tag ${smsStatus?.is_mock ? 'tag-blue' : 'tag-amber'}`}>
                      {smsStatus?.is_mock ? 'MOCK SIMULATION (ACADEMIC)' : 'DEMO TEST MODE'}
                    </span>
                  </div>
                </div>

                <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '10px', border: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="info-label">Target Recipient</span>
                    <span className="info-value" style={{ fontWeight: 600, color: 'var(--text-heading)' }}>
                      {smsStatus?.admin_test_phone_masked || 'Not Configured in .env'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="info-label">Daily Test Quota</span>
                    <span className={`tag ${smsStatus?.remaining_daily_tests > 0 ? 'tag-green' : 'tag-red'}`}>
                      {smsStatus?.daily_test_count ?? 0} / {smsStatus?.daily_test_limit ?? 5} Used
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="info-label">Community Broadcast</span>
                    <span className="tag tag-gray">Disabled (Safety Lock)</span>
                  </div>
                </div>
              </div>

              {/* Action Banner for Test Send */}
              <div style={{
                background: '#f8fafc',
                border: '1px solid var(--border-light)',
                borderRadius: '10px',
                padding: '16px',
                marginBottom: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <div>
                    <h4 style={{ margin: '0 0 4px 0', fontSize: '13.5px', fontWeight: 600, color: 'var(--text-heading)' }}>
                      {smsStatus?.is_mock ? 'Simulated SMS Test (Mock Mode)' : 'Protected Handset Delivery Test'}
                    </h4>
                    <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {smsStatus?.is_mock
                        ? 'Simulates a community flood alert, generates a mock SID, and logs the payload locally without sending a real SMS.'
                        : `Dispatches a single authenticated test SMS to your verified handset: ${smsStatus?.admin_test_phone_masked || 'your number'}`}
                    </p>
                  </div>

                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleSendTestSms}
                    disabled={smsLoading || !smsStatus?.ready || (smsStatus?.remaining_daily_tests ?? 0) <= 0}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
                    title={
                      !smsStatus?.ready
                        ? 'Configure SMS provider in .env first'
                        : (smsStatus?.remaining_daily_tests ?? 0) <= 0
                        ? 'Daily test limit reached'
                        : 'Trigger test SMS'
                    }
                  >
                    {smsLoading ? (
                      <>
                        <RefreshCw size={14} className="spin" aria-hidden="true" />
                        {smsStatus?.is_mock ? 'Simulating Dispatch...' : 'Dispatching via Twilio...'}
                      </>
                    ) : (
                      <>
                        <Send size={14} aria-hidden="true" />
                        {smsStatus?.is_mock ? 'Send Simulated Test SMS (Mock)' : 'Send Test SMS to My Mobile'}
                      </>
                    )}
                  </button>
                </div>

                {/* Status Banners */}
                {smsActionMsg && (
                  <div style={{
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    color: '#15803d',
                    padding: '10px 12px',
                    borderRadius: '6px',
                    fontSize: '12.5px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}>
                    <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
                    <span>{smsActionMsg}</span>
                  </div>
                )}

                {smsError && (
                  <div style={{
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    color: '#b91c1c',
                    padding: '10px 12px',
                    borderRadius: '6px',
                    fontSize: '12.5px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}>
                    <XCircle size={16} style={{ flexShrink: 0 }} />
                    <span>{smsError}</span>
                  </div>
                )}
              </div>

              {/* SMS Dispatch History Table */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <p style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: 0 }}>
                    SMS Dispatch Audit Log
                  </p>
                  <button
                    type="button"
                    onClick={fetchSmsData}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary-600)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11.5px' }}
                    title="Refresh logs"
                  >
                    <RefreshCw size={11} /> Refresh
                  </button>
                </div>

                {smsLogs && smsLogs.length > 0 ? (
                  <div className="table-wrap">
                    <table className="data-table" aria-label="SMS dispatch audit table">
                      <thead>
                        <tr>
                          <th scope="col">#</th>
                          <th scope="col">Timestamp</th>
                          <th scope="col">Recipient</th>
                          <th scope="col">Provider</th>
                          <th scope="col">Message SID / Reference</th>
                          <th scope="col">Delivery Status</th>
                          <th scope="col">Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {smsLogs.map((log, idx) => (
                          <tr key={log.id || idx}>
                            <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{idx + 1}</td>
                            <td style={{ fontVariantNumeric: 'tabular-nums' }}>{formatTs(log.timestamp)}</td>
                            <td style={{ fontWeight: 500 }}>{log.masked_phone || log.phone_number}</td>
                            <td>
                              <span className={`tag ${log.provider_name === 'mock' ? 'tag-blue' : 'tag-gray'}`}>
                                {log.provider_name ? log.provider_name.toUpperCase() : 'MOCK'}
                              </span>
                            </td>
                            <td style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-muted)' }}>
                              {log.provider_message_id || '—'}
                            </td>
                            <td>
                              <span className={`tag ${log.delivery_status === 'mock_sent' || log.delivery_status === 'simulated' ? 'tag-blue' : (log.delivery_status === 'sent' || log.delivery_status === 'delivered' ? 'tag-green' : 'tag-red')}`}>
                                {log.delivery_status}
                              </span>
                            </td>
                            <td>
                              <span className={`tag ${log.delivery_status === 'mock_sent' || log.delivery_status === 'simulated' ? 'tag-blue' : 'tag-amber'}`}>
                                {log.delivery_status === 'mock_sent' ? 'SIMULATED' : 'TEST'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="table-empty" role="status" style={{ padding: '24px' }}>
                    No test SMS messages dispatched yet.
                    <br />
                    <span style={{ fontSize: '12px' }}>
                      Click &quot;Send Simulated Test SMS (Mock)&quot; to test simulated SMS dispatch and database audit logging.
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

      </div>
    </main>
  );
}
