/**
 * Dashboard Page
 *
 * DATA SOURCES (corrected architecture):
 * ─────────────────────────────────────────────────────────────────
 * sensorData      → from ESP32 via Bluetooth: { temperature, humidity, rainfall, water_level }
 * systemLocation  → from this computer:        { latitude, longitude, elevation }
 * ─────────────────────────────────────────────────────────────────
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Thermometer,
  Droplets,
  CloudRain,
  Waves,
  Cpu,
  Bluetooth,
  Server,
  BrainCircuit,
  ArrowRight,
  MessageSquare,
  Monitor,
  Activity,
  Info,
  Save,
  Check,
  Settings,
} from 'lucide-react';

import SensorCard from '../components/SensorCard';
import StatusCard from '../components/StatusCard';
import FloodStatus from '../components/FloodStatus';
import LocationCard from '../components/LocationCard';

export default function Dashboard({
  sensorData,
  systemLocation,
  onSystemLocationUpdate,
  apiStatus,
  lastPrediction,
  ledStatus = null,
  autoPredictEnabled = false,
  onToggleAutoPredict,
  autoPredictStatus = { active: false, code: 'off', message: 'Auto-Prediction is paused.' },
  lastAutoPredictTime,
  onEvaluateTelemetry,
  isEvaluatingTelemetry = false,
  evalTelemetryError = null,
  evalTelemetrySuccess = null,
}) {
  const s = sensorData;

  const [showLocationForm, setShowLocationForm] = useState(false);
  const [locForm, setLocForm] = useState({
    latitude: systemLocation?.latitude ?? '',
    longitude: systemLocation?.longitude ?? '',
    elevation: systemLocation?.elevation ?? '',
  });
  const [locError, setLocError] = useState(null);

  const handleSaveLocation = (e) => {
    e.preventDefault();
    const lat = parseFloat(locForm.latitude);
    const lon = parseFloat(locForm.longitude);
    const elev = parseFloat(locForm.elevation);

    if (isNaN(lat) || lat < -90 || lat > 90) {
      setLocError('Latitude must be a valid coordinate between -90 and 90.');
      return;
    }
    if (isNaN(lon) || lon < -180 || lon > 180) {
      setLocError('Longitude must be a valid coordinate between -180 and 180.');
      return;
    }
    if (isNaN(elev) || elev < 0 || elev > 9000) {
      setLocError('Elevation must be a valid height between 0 and 9000 meters.');
      return;
    }

    setLocError(null);
    if (onSystemLocationUpdate) {
      onSystemLocationUpdate({ latitude: lat, longitude: lon, elevation: elev });
    }
    setShowLocationForm(false);
  };

  const systemComponents = [
    {
      label: 'ESP32',
      icon: Cpu,
      status: s ? 'connected' : 'disconnected',
      description: s
        ? 'Receiving sensor readings via Bluetooth'
        : 'No sensor data received from ESP32 yet',
    },
    {
      label: 'Bluetooth',
      icon: Bluetooth,
      status: s ? 'connected' : 'disconnected',
      description: s
        ? 'Bluetooth data stream active'
        : 'Bluetooth receiver not connected',
    },
    {
      label: 'FastAPI',
      icon: Server,
      status:
        apiStatus === 'online' ? 'connected' :
        apiStatus === 'checking' ? 'checking' : 'disconnected',
      description:
        apiStatus === 'online'
          ? 'API reachable at port 8000'
          : apiStatus === 'checking'
          ? 'Verifying connection…'
          : 'Cannot reach FastAPI at 127.0.0.1:8000',
    },
    {
      label: 'Random Forest Model',
      icon: BrainCircuit,
      status: apiStatus === 'online' ? 'ready' : 'unavailable',
      description:
        apiStatus === 'online'
          ? 'flood_model_rf.pkl loaded and ready'
          : 'Model unavailable until FastAPI is reachable',
    },
  ];

  // ESP32 provides ONLY these 4 sensor readings
  const sensorCards = [
    {
      label: 'Temperature',
      value: s?.temperature,
      unit: '°C',
      icon: Thermometer,
      colorClass: 'amber',
      sensorKey: 'temperature',
    },
    {
      label: 'Humidity',
      value: s?.humidity,
      unit: '%',
      icon: Droplets,
      colorClass: 'blue',
      sensorKey: 'humidity',
    },
    {
      label: 'Rainfall',
      value: s?.rainfall,
      unit: 'mm',
      icon: CloudRain,
      colorClass: 'cyan',
      sensorKey: 'rainfall',
    },
    {
      label: 'Water Level',
      value: s?.water_level,
      unit: 'm',
      icon: Waves,
      colorClass: 'blue',
      sensorKey: 'waterLevel',
    },
  ];

  return (
    <main id="main-content" aria-label="Dashboard">
      {/* API offline warning */}
      {apiStatus === 'offline' && (
        <div className="api-error-bar" role="alert">
          <Server size={15} aria-hidden="true" />
          <span>
            <strong>FastAPI Unavailable</strong> – Cannot reach{' '}
            <code>http://127.0.0.1:8000</code>. Start the FastAPI backend to enable predictions.
          </span>
        </div>
      )}

      {/* No sensor data notice */}
      {!s && (
        <div className="api-warning-bar" role="status">
          <Bluetooth size={15} aria-hidden="true" />
          <span>
            <strong>No sensor data received yet.</strong> Connect the ESP32 via Bluetooth and
            start the Python Bluetooth receiver to populate Temperature, Humidity, Rainfall,
            and Water Level readings.
          </span>
        </div>
      )}

      {/* ── System Overview ─────────────────────────────── */}
      <section aria-labelledby="system-overview-heading">
        <div className="section-title" id="system-overview-heading">
          <Server size={15} aria-hidden="true" />
          System Overview
        </div>
        <div className="grid-4">
          {systemComponents.map((comp) => (
            <StatusCard
              key={comp.label}
              label={comp.label}
              description={comp.description}
              status={comp.status}
              icon={comp.icon}
            />
          ))}
        </div>
      </section>

      <div style={{ height: '24px' }} />

      {/* ── Flood Risk & Auto-Prediction Engine ──────────────────────── */}
      <section aria-labelledby="flood-risk-heading">
        <div className="section-title" id="flood-risk-heading">
          <BrainCircuit size={15} aria-hidden="true" />
          Current Flood Risk Assessment
        </div>

        {/* ── Auto-Prediction Toggle Panel ─────────────────────── */}
        <div
          className="card"
          style={{
            padding: '16px 20px',
            marginBottom: '16px',
            border: autoPredictEnabled ? '1px solid var(--primary-200)' : '1px solid var(--border-light)',
            background: autoPredictEnabled ? '#f8faff' : '#ffffff',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: autoPredictEnabled ? 'var(--primary-100)' : '#f1f5f9',
                  color: autoPredictEnabled ? 'var(--primary-600)' : 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                aria-hidden="true"
              >
                <Activity size={19} />
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-heading)', margin: 0 }}>
                    Live Auto-Prediction Engine
                  </h3>
                  <span
                    className={`tag ${
                      !autoPredictEnabled
                        ? 'tag-gray'
                        : autoPredictStatus.code === 'monitoring'
                        ? 'tag-green'
                        : autoPredictStatus.code === 'cooldown'
                        ? 'tag-blue'
                        : autoPredictStatus.code === 'no_telemetry'
                        ? 'tag-amber'
                        : 'tag-amber'
                    }`}
                  >
                    {!autoPredictEnabled
                      ? 'OFF (MANUAL ONLY)'
                      : autoPredictStatus.code === 'monitoring'
                      ? 'ACTIVE · MONITORING'
                      : autoPredictStatus.code === 'cooldown'
                      ? 'COOLDOWN'
                      : autoPredictStatus.code === 'no_telemetry'
                      ? 'WAITING FOR TELEMETRY'
                      : 'LOCATION REQUIRED'}
                  </span>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '3px', marginBottom: 0 }}>
                  {autoPredictStatus.message}
                </p>
              </div>
            </div>

            {/* Toggle Switch */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  userSelect: 'none',
                  fontSize: '13px',
                  fontWeight: '600',
                  color: autoPredictEnabled ? 'var(--primary-700)' : 'var(--text-secondary)',
                }}
              >
                <span>{autoPredictEnabled ? 'Auto-Predict ON' : 'Auto-Predict OFF'}</span>
                <input
                  type="checkbox"
                  checked={autoPredictEnabled}
                  onChange={(e) => onToggleAutoPredict && onToggleAutoPredict(e.target.checked)}
                  style={{
                    width: '18px',
                    height: '18px',
                    cursor: 'pointer',
                    accentColor: 'var(--primary-600)',
                  }}
                  aria-label="Toggle automatic flood prediction"
                />
              </label>
            </div>
          </div>

          {/* Rain sensor disclosure notice */}
          <div
            style={{
              marginTop: '12px',
              paddingTop: '10px',
              borderTop: '1px solid var(--border-light)',
              fontSize: '11px',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
            role="note"
          >
            <Info size={13} style={{ flexShrink: 0, color: 'var(--info-600)' }} aria-hidden="true" />
            <span>
              <strong>Sensor Calibration Disclosure:</strong> The rain sensor provides a relative wetness percentage (0–100%), which serves as an environmental wetness indicator for the ML model, not a calibrated millimetre rainfall measurement.
            </span>
          </div>
        </div>

        <FloodStatus
          prediction={lastPrediction?.prediction}
          timestamp={lastPrediction?.timestamp}
          mode={lastPrediction?.mode}
          status={lastPrediction?.status}
          message={lastPrediction?.message}
          isHistorical={lastPrediction?.isHistorical}
          sensorData={sensorData}
          ledStatus={ledStatus}
          onEvaluate={onEvaluateTelemetry}
          isEvaluating={isEvaluatingTelemetry}
          evalError={evalTelemetryError}
          evalSuccess={evalTelemetrySuccess}
        />

        <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: '10px' }}>
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
              }}
              title="Run active Random Forest model using the latest live ESP32 telemetry"
            >
              <Activity size={13} aria-hidden="true" />
              <span>{isEvaluatingTelemetry ? 'Evaluating...' : 'Evaluate Current ESP32 Telemetry'}</span>
            </button>
          )}

          <Link to="/flood-prediction" className="btn btn-outline btn-sm">
            Manual Prediction Simulation
            <ArrowRight size={13} aria-hidden="true" />
          </Link>
        </div>
      </section>

      <div style={{ height: '24px' }} />

      {/* ── ESP32 Sensor Readings ────────────────────────── */}
      <section aria-labelledby="sensor-readings-heading">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '16px',
          }}
        >
          <div>
            <div className="section-title" id="sensor-readings-heading" style={{ margin: 0 }}>
              <Cpu size={15} aria-hidden="true" />
              ESP32 Sensor Readings
            </div>
            <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Temperature · Humidity · Rainfall · Water Level — received via Bluetooth
            </p>
          </div>
          <Link to="/live-monitoring" className="btn btn-outline btn-sm">
            View Charts
            <ArrowRight size={13} aria-hidden="true" />
          </Link>
        </div>

        <div className="grid-4">
          {sensorCards.map((card) => (
            <SensorCard
              key={card.label}
              label={card.label}
              value={card.value}
              unit={card.unit}
              icon={card.icon}
              colorClass={card.colorClass}
              sensorKey={card.sensorKey}
            />
          ))}
        </div>
      </section>

      <div style={{ height: '24px' }} />

      {/* ── System Location ──────────────────────────────── */}
      <section aria-labelledby="location-heading">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '16px',
          }}
        >
          <div>
            <div className="section-title" id="location-heading" style={{ margin: 0 }}>
              <Monitor size={15} aria-hidden="true" />
              System Location
            </div>
            <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Latitude · Longitude · Elevation — configured on this computer (required for ML predictions)
            </p>
          </div>

          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => {
              setLocForm({
                latitude: systemLocation?.latitude ?? '',
                longitude: systemLocation?.longitude ?? '',
                elevation: systemLocation?.elevation ?? '',
              });
              setShowLocationForm((v) => !v);
              setLocError(null);
            }}
          >
            <Settings size={13} aria-hidden="true" />
            {systemLocation ? (showLocationForm ? 'Cancel' : 'Edit Location') : (showLocationForm ? 'Cancel' : 'Configure Location')}
          </button>
        </div>

        {/* Inline Station Location Configuration Form */}
        {showLocationForm && (
          <div
            className="card"
            style={{ padding: '16px 20px', marginBottom: '16px', border: '1px solid var(--primary-200)', background: '#f8fafc' }}
          >
            <form onSubmit={handleSaveLocation} noValidate>
              <p style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-heading)', marginBottom: '4px' }}>
                Configure Station Coordinates
              </p>
              <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                The ESP32 does not have a GPS module. Enter your monitoring station's coordinates to enable both manual and live automatic predictions.
              </p>

              {locError && (
                <div className="api-error-bar" role="alert" style={{ marginBottom: '12px' }}>
                  <Info size={13} />
                  <span>{locError}</span>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label htmlFor="dash-lat" style={{ fontSize: '11.5px', fontWeight: '600', display: 'block', marginBottom: '4px' }}>
                    Latitude (°)
                  </label>
                  <input
                    id="dash-lat"
                    type="number"
                    step="0.0001"
                    className="form-input"
                    value={locForm.latitude}
                    onChange={(e) => setLocForm((prev) => ({ ...prev, latitude: e.target.value }))}
                    placeholder="e.g. 22.5726"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="dash-lon" style={{ fontSize: '11.5px', fontWeight: '600', display: 'block', marginBottom: '4px' }}>
                    Longitude (°)
                  </label>
                  <input
                    id="dash-lon"
                    type="number"
                    step="0.0001"
                    className="form-input"
                    value={locForm.longitude}
                    onChange={(e) => setLocForm((prev) => ({ ...prev, longitude: e.target.value }))}
                    placeholder="e.g. 88.3639"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="dash-elev" style={{ fontSize: '11.5px', fontWeight: '600', display: 'block', marginBottom: '4px' }}>
                    Elevation (m)
                  </label>
                  <input
                    id="dash-elev"
                    type="number"
                    step="0.1"
                    className="form-input"
                    value={locForm.elevation}
                    onChange={(e) => setLocForm((prev) => ({ ...prev, elevation: e.target.value }))}
                    placeholder="e.g. 9.0"
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => setShowLocationForm(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary btn-sm">
                  <Save size={13} aria-hidden="true" />
                  Save Station Location
                </button>
              </div>
            </form>
          </div>
        )}

        <LocationCard
          latitude={systemLocation?.latitude}
          longitude={systemLocation?.longitude}
          elevation={systemLocation?.elevation}
        />
      </section>

      <div style={{ height: '24px' }} />

      {/* ── Quick Actions ─────────────────────────────────── */}
      <section aria-labelledby="quick-nav-heading">
        <div className="section-title" id="quick-nav-heading">
          Quick Actions
        </div>
        <div className="grid-3">
          <Link
            to="/live-monitoring"
            className="card"
            style={{ padding: '20px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '14px' }}
          >
            <div className="sensor-icon-wrap blue" aria-hidden="true">
              <Waves size={18} />
            </div>
            <div>
              <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-heading)', marginBottom: '2px' }}>
                Live Monitoring
              </p>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                View real-time ESP32 sensor charts
              </p>
            </div>
            <ArrowRight size={16} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} aria-hidden="true" />
          </Link>

          <Link
            to="/flood-prediction"
            className="card"
            style={{ padding: '20px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '14px' }}
          >
            <div className="sensor-icon-wrap green" aria-hidden="true">
              <BrainCircuit size={18} />
            </div>
            <div>
              <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-heading)', marginBottom: '2px' }}>
                Run Prediction
              </p>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Submit readings to the ML model
              </p>
            </div>
            <ArrowRight size={16} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} aria-hidden="true" />
          </Link>

          <Link
            to="/alerts"
            className="card"
            style={{ padding: '20px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '14px' }}
          >
            <div className="sensor-icon-wrap amber" aria-hidden="true">
              <MessageSquare size={18} />
            </div>
            <div>
              <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-heading)', marginBottom: '2px' }}>
                Alert Center
              </p>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                View alerts and community notifications
              </p>
            </div>
            <ArrowRight size={16} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} aria-hidden="true" />
          </Link>
        </div>
      </section>
    </main>
  );
}
