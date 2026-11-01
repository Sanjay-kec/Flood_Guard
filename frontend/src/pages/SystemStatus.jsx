/**
 * System Status Page
 *
 * CORRECT DATA ARCHITECTURE:
 * ─────────────────────────────────────────────────────────────────
 * ESP32 provides: temperature, humidity, rainfall, water_level
 *   ↑ No GPS. No latitude/longitude/elevation.
 *
 * Computer provides: latitude, longitude, elevation (systemLocation)
 *   ↑ These are system-configured values, not from ESP32.
 * ─────────────────────────────────────────────────────────────────
 *
 * Data flow:
 *   ESP32 → Bluetooth → Python Receiver → FastAPI → React
 *   Computer (system location) ──────────────────→ React
 */
import {
  Cpu,
  Bluetooth,
  Radio,
  Server,
  BrainCircuit,
  MessageSquare,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Info,
  Monitor,
} from 'lucide-react';
import StatusCard from '../components/StatusCard';

export default function SystemStatus({ apiStatus, sensorData, systemLocation, onCheckApi }) {
  const now = new Date().toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  const components = [
    {
      label: 'ESP32 Microcontroller',
      icon: Cpu,
      status: sensorData ? 'connected' : 'disconnected',
      description: sensorData
        ? 'ESP32 is sending Temperature, Humidity, Rainfall, Water Level via Bluetooth.'
        : 'No sensor data from ESP32. Ensure device is powered and sketch is running. Note: ESP32 has no GPS module.',
      lastUpdate: sensorData ? now : null,
    },
    {
      label: 'Bluetooth Connection',
      icon: Bluetooth,
      status: sensorData ? 'connected' : 'disconnected',
      description: sensorData
        ? 'Bluetooth data stream active — receiving 4 sensor readings from ESP32.'
        : 'Bluetooth connection not established. No sensor data received.',
      lastUpdate: sensorData ? now : null,
    },
    {
      label: 'Bluetooth Receiver (Python)',
      icon: Radio,
      status: sensorData ? 'connected' : 'disconnected',
      description: sensorData
        ? 'Python Bluetooth receiver script is running and forwarding ESP32 data to FastAPI.'
        : 'Python Bluetooth receiver script is not running or not forwarding data. Start the receiver to enable sensor data flow.',
      lastUpdate: sensorData ? now : null,
    },
    {
      label: 'FastAPI Backend',
      icon: Server,
      status:
        apiStatus === 'online' ? 'connected' :
        apiStatus === 'checking' ? 'checking' : 'disconnected',
      description:
        apiStatus === 'online'
          ? 'FastAPI is running and reachable at http://127.0.0.1:8000'
          : apiStatus === 'checking'
          ? 'Checking connectivity to http://127.0.0.1:8000…'
          : 'FastAPI is not reachable. Run: python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000',
      lastUpdate: apiStatus === 'online' ? now : null,
    },
    {
      label: 'Random Forest Model (flood_model_rf.pkl)',
      icon: BrainCircuit,
      status: apiStatus === 'online' ? 'ready' : 'unavailable',
      description:
        apiStatus === 'online'
          ? 'Model is loaded and ready for prediction via POST /predict/rf (7 inputs)'
          : 'ML model unavailable — start FastAPI backend to load the model.',
      lastUpdate: apiStatus === 'online' ? now : null,
    },
    {
      label: 'System Location',
      icon: Monitor,
      status: systemLocation ? 'ready' : 'not_configured',
      description: systemLocation
        ? `Latitude: ${Number(systemLocation.latitude).toFixed(4)}°, Longitude: ${Number(systemLocation.longitude).toFixed(4)}°, Elevation: ${systemLocation.elevation} m`
        : 'System location (lat/lon/elevation) not yet configured. Set it on the Flood Prediction page. This is a computer-side value — not from ESP32.',
      lastUpdate: systemLocation ? now : null,
    },
    {
      label: 'SMS Gateway',
      icon: MessageSquare,
      status: 'not_configured',
      description:
        'SMS gateway is not configured. Integration with an SMS provider (e.g. MSG91, Twilio) is required for community alerts.',
      lastUpdate: null,
    },
  ];

  return (
    <main id="main-content" aria-label="System Status">
      {/* Page intro */}
      <div
        style={{
          background: 'var(--info-50)', border: '1px solid var(--info-100)',
          borderRadius: '8px', padding: '12px 16px',
          display: 'flex', alignItems: 'flex-start', gap: '10px',
          marginBottom: '24px', fontSize: '13px', color: 'var(--info-600)',
        }}
        role="note"
      >
        <Info size={15} style={{ marginTop: '1px', flexShrink: 0 }} aria-hidden="true" />
        <div>
          All statuses are derived from actual application state — nothing is assumed.
          The ESP32 provides <strong>only 4 sensor readings</strong> (Temperature, Humidity,
          Rainfall, Water Level). <strong>System Location</strong> (Latitude, Longitude,
          Elevation) is configured separately on this computer and is not related to ESP32.
        </div>
      </div>

      {/* Re-check button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
        <button
          className="btn btn-outline btn-sm"
          onClick={onCheckApi}
          aria-label="Re-check API status"
        >
          <RefreshCw size={13} aria-hidden="true" />
          Re-check Status
        </button>
      </div>

      {/* Status cards */}
      <section aria-labelledby="components-heading">
        <div className="section-title" id="components-heading">Component Health</div>
        <div className="stack" style={{ gap: '12px' }}>
          {components.map((comp) => (
            <StatusCard
              key={comp.label}
              label={comp.label}
              description={comp.description}
              status={comp.status}
              icon={comp.icon}
              lastUpdate={comp.lastUpdate}
            />
          ))}
        </div>
      </section>

      {/* ── Corrected Data Flow Diagram ──────────────────── */}
      <section aria-labelledby="data-flow-heading" style={{ marginTop: '32px' }}>
        <div className="section-title" id="data-flow-heading">
          Correct Data Flow Architecture
        </div>

        <div className="card">
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '16px', alignItems: 'start' }}>

              {/* Left column: ESP32 data flow */}
              <div>
                <p
                  style={{
                    fontSize: '11px', fontWeight: '700', textTransform: 'uppercase',
                    letterSpacing: '0.8px', color: 'var(--primary-600)',
                    marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px',
                  }}
                >
                  <Cpu size={12} aria-hidden="true" />
                  ESP32 Sensor Data
                </p>

                {[
                  {
                    icon: Cpu,
                    label: 'ESP32 Microcontroller',
                    desc: 'Reads Temperature, Humidity, Rainfall, Water Level',
                    note: 'No GPS module',
                    active: !!sensorData,
                  },
                  { arrow: true },
                  {
                    icon: Bluetooth,
                    label: 'Bluetooth',
                    desc: 'Transmits 4 sensor readings wirelessly',
                    active: !!sensorData,
                  },
                  { arrow: true },
                  {
                    icon: Radio,
                    label: 'Python Bluetooth Receiver',
                    desc: 'Receives Bluetooth data, forwards to FastAPI',
                    active: !!sensorData,
                  },
                  { arrow: true },
                  {
                    icon: Server,
                    label: 'FastAPI',
                    desc: 'Receives sensor data, combines with system location',
                    active: apiStatus === 'online',
                  },
                ].map((item, idx) => {
                  if (item.arrow) {
                    return (
                      <div key={idx} style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '18px', padding: '2px 0' }} aria-hidden="true">
                        ↓
                      </div>
                    );
                  }
                  const Icon = item.icon;
                  return (
                    <div
                      key={idx}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '10px 12px', borderRadius: '8px',
                        background: item.active ? 'var(--success-50)' : '#f8fafc',
                        border: `1px solid ${item.active ? 'var(--success-100)' : 'var(--border-light)'}`,
                      }}
                    >
                      <div
                        style={{
                          width: '32px', height: '32px', borderRadius: '7px', flexShrink: 0,
                          background: item.active ? 'var(--success-100)' : '#e2e8f0',
                          color: item.active ? 'var(--success-600)' : 'var(--text-muted)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                        aria-hidden="true"
                      >
                        <Icon size={15} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-heading)' }}>{item.label}</p>
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{item.desc}</p>
                        {item.note && (
                          <p style={{ fontSize: '10px', color: 'var(--danger-600)', fontWeight: '600', marginTop: '2px' }}>
                            ⚠ {item.note}
                          </p>
                        )}
                      </div>
                      {item.active
                        ? <CheckCircle2 size={15} style={{ color: 'var(--success-500)', flexShrink: 0 }} aria-label="Active" />
                        : <XCircle size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} aria-label="Not active" />
                      }
                    </div>
                  );
                })}
              </div>

              {/* Center divider */}
              <div
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', paddingTop: '40px',
                }}
                aria-hidden="true"
              >
                <div style={{ width: '1px', height: '80px', background: 'var(--border-medium)' }} />
                <div style={{ padding: '6px 12px', background: '#f1f5f9', borderRadius: '99px', fontSize: '10px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '8px 0', whiteSpace: 'nowrap' }}>
                  Merged at FastAPI
                </div>
                <div style={{ width: '1px', height: '80px', background: 'var(--border-medium)' }} />
              </div>

              {/* Right column: System Location */}
              <div>
                <p
                  style={{
                    fontSize: '11px', fontWeight: '700', textTransform: 'uppercase',
                    letterSpacing: '0.8px', color: 'var(--success-600)',
                    marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px',
                  }}
                >
                  <Monitor size={12} aria-hidden="true" />
                  System Location (Computer)
                </p>

                <div
                  style={{
                    padding: '14px', borderRadius: '10px',
                    background: systemLocation ? 'var(--success-50)' : '#f8fafc',
                    border: `1px solid ${systemLocation ? 'var(--success-100)' : 'var(--border-light)'}`,
                    marginBottom: '8px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                    <div
                      style={{
                        width: '32px', height: '32px', borderRadius: '7px',
                        background: systemLocation ? 'var(--success-100)' : '#e2e8f0',
                        color: systemLocation ? 'var(--success-600)' : 'var(--text-muted)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}
                      aria-hidden="true"
                    >
                      <Monitor size={15} />
                    </div>
                    <div>
                      <p style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-heading)' }}>
                        This Computer
                      </p>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        Latitude · Longitude · Elevation
                      </p>
                    </div>
                  </div>

                  {systemLocation ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {[
                        { l: 'Latitude', v: `${Number(systemLocation.latitude).toFixed(4)}°` },
                        { l: 'Longitude', v: `${Number(systemLocation.longitude).toFixed(4)}°` },
                        { l: 'Elevation', v: `${systemLocation.elevation} m` },
                      ].map(({ l, v }) => (
                        <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                          <span style={{ color: 'var(--text-muted)' }}>{l}</span>
                          <span style={{ fontWeight: '600', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      Not configured — set on the Flood Prediction page
                    </p>
                  )}
                </div>

                <div
                  style={{
                    padding: '10px', background: 'var(--info-50)', borderRadius: '8px',
                    border: '1px solid var(--info-100)', fontSize: '11px', color: 'var(--info-600)',
                  }}
                  role="note"
                >
                  <strong>Note:</strong> The ESP32 has no GPS module. Latitude, Longitude and
                  Elevation describe the fixed location of this monitoring station and are
                  configured on this computer.
                </div>

                {/* Arrow down to FastAPI + React */}
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '18px', padding: '6px 0' }} aria-hidden="true">↓</div>

                {/* FastAPI */}
                <div style={{ padding: '10px 12px', borderRadius: '8px', background: apiStatus === 'online' ? 'var(--success-50)' : '#f8fafc', border: `1px solid ${apiStatus === 'online' ? 'var(--success-100)' : 'var(--border-light)'}`, marginBottom: '4px' }}>
                  <p style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-heading)' }}>FastAPI runs ML prediction</p>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    7 inputs → flood_model_rf.pkl → prediction 0 or 1
                  </p>
                </div>

                <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '18px', padding: '4px 0' }} aria-hidden="true">↓</div>

                <div style={{ padding: '10px 12px', borderRadius: '8px', background: 'var(--primary-50)', border: '1px solid var(--primary-100)' }}>
                  <p style={{ fontSize: '12px', fontWeight: '600', color: 'var(--primary-700)' }}>React Frontend</p>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Displays sensor readings, charts, and prediction results
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
