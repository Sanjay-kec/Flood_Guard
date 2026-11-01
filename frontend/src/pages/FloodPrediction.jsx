/**
 * Flood Prediction Page
 *
 * CORRECT DATA ARCHITECTURE:
 * ─────────────────────────────────────────────────────────────────
 * ESP32 Sensor Readings (auto-fillable from sensorData prop):
 *   temperature, humidity, rainfall, water_level
 *
 * System Location (configured on this computer – NOT from ESP32):
 *   latitude, longitude, elevation
 *   ↑ Shown in a separate "System Location" section with its own
 *     save/configure flow. Persisted via onSystemLocationUpdate().
 * ─────────────────────────────────────────────────────────────────
 *
 * POST /predict sends exactly these 7 field names to Flask:
 *   { latitude, longitude, rainfall, temperature, humidity, water_level, elevation }
 * No probability is invented. Prediction 0 = LOW RISK, 1 = HIGH RISK.
 */
import { useState } from 'react';
import {
  BrainCircuit,
  Thermometer,
  Droplets,
  CloudRain,
  Waves,
  Navigation,
  MapPin,
  Mountain,
  ShieldCheck,
  AlertTriangle,
  HelpCircle,
  Loader2,
  Info,
  Clock,
  Monitor,
  Cpu,
  Save,
} from 'lucide-react';
import { predictFlood } from '../services/api';

// ── ESP32 sensor fields (4 readings from the device) ──────────────
const SENSOR_FIELD_CONFIG = [
  {
    key: 'temperature',
    label: 'Temperature',
    unit: '°C',
    icon: Thermometer,
    placeholder: 'e.g. 28.5',
    min: -10, max: 60, step: 0.1,
    help: 'Ambient temperature from ESP32 sensor',
  },
  {
    key: 'humidity',
    label: 'Humidity',
    unit: '%',
    icon: Droplets,
    placeholder: 'e.g. 75.0',
    min: 0, max: 100, step: 0.1,
    help: 'Relative humidity from ESP32 sensor (0–100%)',
  },
  {
    key: 'rainfall',
    label: 'Rainfall',
    unit: 'mm',
    icon: CloudRain,
    placeholder: 'e.g. 45.0',
    min: 0, max: 500, step: 0.1,
    help: 'Cumulative rainfall from ESP32 rain sensor',
  },
  {
    key: 'water_level',
    label: 'Water Level',
    unit: 'm',
    icon: Waves,
    placeholder: 'e.g. 1.8',
    min: 0, max: 20, step: 0.01,
    help: 'Water body level from ESP32 sensor',
  },
];

// ── System/computer location fields (NOT from ESP32) ───────────────
const LOCATION_FIELD_CONFIG = [
  {
    key: 'latitude',
    label: 'Latitude',
    unit: '°',
    icon: Navigation,
    placeholder: 'e.g. 22.5726',
    min: -90, max: 90, step: 0.0001,
    help: 'Monitoring site latitude — configured on this computer',
  },
  {
    key: 'longitude',
    label: 'Longitude',
    unit: '°',
    icon: MapPin,
    placeholder: 'e.g. 88.3639',
    min: -180, max: 180, step: 0.0001,
    help: 'Monitoring site longitude — configured on this computer',
  },
  {
    key: 'elevation',
    label: 'Elevation',
    unit: 'm',
    icon: Mountain,
    placeholder: 'e.g. 9.0',
    min: 0, max: 9000, step: 0.1,
    help: 'Monitoring site elevation above sea level — configured on this computer',
  },
];

const INITIAL_SENSOR_FORM = {
  temperature: '',
  humidity: '',
  rainfall: '',
  water_level: '',
};

const INITIAL_LOCATION_FORM = {
  latitude: '',
  longitude: '',
  elevation: '',
};

export default function FloodPrediction({
  apiStatus,
  onNewPrediction,
  sensorData,
  systemLocation,
  onSystemLocationUpdate,
}) {
  const [sensorForm, setSensorForm] = useState(INITIAL_SENSOR_FORM);
  const [locationForm, setLocationForm] = useState(
    systemLocation
      ? { latitude: systemLocation.latitude ?? '', longitude: systemLocation.longitude ?? '', elevation: systemLocation.elevation ?? '' }
      : INITIAL_LOCATION_FORM
  );
  const [locationSaved, setLocationSaved] = useState(!!systemLocation);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Auto-fill ONLY the 4 ESP32 sensor fields
  const autoFillFromSensor = () => {
    if (!sensorData) return;
    setSensorForm({
      temperature: sensorData.temperature ?? '',
      humidity: sensorData.humidity ?? '',
      rainfall: sensorData.rainfall ?? '',
      water_level: sensorData.water_level ?? '',
    });
  };

  const handleSensorChange = (e) => {
    const { name, value } = e.target;
    setSensorForm((prev) => ({ ...prev, [name]: value }));
    setError(null);
  };

  const handleLocationChange = (e) => {
    const { name, value } = e.target;
    setLocationForm((prev) => ({ ...prev, [name]: value }));
    setLocationSaved(false);
  };

  const handleSaveLocation = () => {
    const { latitude, longitude, elevation } = locationForm;
    if (!latitude || !longitude || !elevation) return;
    const loc = {
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      elevation: parseFloat(elevation),
    };
    setLocationSaved(true);
    if (onSystemLocationUpdate) onSystemLocationUpdate(loc);
  };

  const sensorAllFilled = SENSOR_FIELD_CONFIG.every((f) => sensorForm[f.key] !== '');
  const locationAllFilled = LOCATION_FIELD_CONFIG.every((f) => locationForm[f.key] !== '');
  const allFilled = sensorAllFilled && locationAllFilled;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!allFilled) {
      setError('Please fill in all 7 fields — both the 4 ESP32 sensor readings and the 3 system location values.');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // Exact field names required by Flask /predict
      const payload = {
        latitude: parseFloat(locationForm.latitude),
        longitude: parseFloat(locationForm.longitude),
        elevation: parseFloat(locationForm.elevation),
        rainfall: parseFloat(sensorForm.rainfall),
        temperature: parseFloat(sensorForm.temperature),
        humidity: parseFloat(sensorForm.humidity),
        water_level: parseFloat(sensorForm.water_level),
      };

      const data = await predictFlood(payload);
      const enriched = {
        ...data,
        timestamp: data.timestamp || new Date().toISOString(),
        id: data.id ?? null,
        inputs: { ...payload },
        mode: 'manual',
      };
      setResult(enriched);
      if (onNewPrediction) onNewPrediction(enriched);
    } catch (err) {
      setError(
        err?.message ||
          'Prediction failed. Ensure FastAPI is running at http://127.0.0.1:8000 and all inputs are valid.'
      );
    } finally {
      setLoading(false);
    }
  };

  const isHigh = result?.prediction === 1;
  const isLow = result?.prediction === 0;

  const formatTs = (ts) => {
    if (!ts) return '';
    try {
      return new Date(ts).toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      });
    } catch { return ts; }
  };

  return (
    <main id="main-content" aria-label="Flood Prediction">
      <div style={{ maxWidth: '900px' }}>

        {/* ─────────────────────────────────────────────────────────
            FORM CARD
        ───────────────────────────────────────────────────────── */}
        <div className="prediction-form-card" style={{ marginBottom: '24px' }}>
          <div className="prediction-form-header">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 className="prediction-form-title">
                  <BrainCircuit size={18} aria-hidden="true" />
                  Flood Prediction
                </h2>
                <p className="prediction-form-subtitle">
                  Combines 4 ESP32 sensor readings + 3 system location values → sends to
                  Random Forest model via FastAPI POST /predict/rf
                </p>
              </div>

              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '6px 12px', borderRadius: '8px',
                  background: apiStatus === 'online' ? 'var(--success-50)' : 'var(--danger-50)',
                  border: `1px solid ${apiStatus === 'online' ? 'var(--success-100)' : 'var(--danger-100)'}`,
                  fontSize: '12px', fontWeight: '600',
                  color: apiStatus === 'online' ? 'var(--success-700)' : 'var(--danger-700)',
                }}
                aria-label={`ML Model status: ${apiStatus === 'online' ? 'Ready' : 'Unavailable'}`}
              >
                <span className={`status-dot ${apiStatus === 'online' ? 'online' : 'offline'}`} />
                <span>Model: {apiStatus === 'online' ? 'Ready' : 'Unavailable'}</span>
              </div>
            </div>
          </div>

          <div className="prediction-form-body">
            {apiStatus === 'offline' && (
              <div className="api-error-bar" role="alert">
                <Info size={14} aria-hidden="true" />
                <span>
                  FastAPI is not reachable. Start the backend at{' '}
                  <code>http://127.0.0.1:8000</code> to run predictions.
                </span>
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate aria-label="Flood prediction form">

              {/* ── Section 1: ESP32 Sensor Readings ─────────────── */}
              <div style={{ marginBottom: '28px' }}>
                <div
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginBottom: '14px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div
                      style={{
                        width: '28px', height: '28px', borderRadius: '6px',
                        background: 'var(--primary-50)', color: 'var(--primary-600)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                      aria-hidden="true"
                    >
                      <Cpu size={14} />
                    </div>
                    <div>
                      <p style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-heading)' }}>
                        ESP32 Sensor Readings
                      </p>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        4 values from ESP32 via Bluetooth
                      </p>
                    </div>
                  </div>

                  {sensorData && (
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={autoFillFromSensor}
                      title="Auto-fill Temperature, Humidity, Rainfall, Water Level from current ESP32 reading"
                    >
                      <Cpu size={12} aria-hidden="true" />
                      Auto-fill from ESP32
                    </button>
                  )}
                </div>

                {!sensorData && (
                  <div
                    style={{
                      padding: '10px 14px', marginBottom: '12px',
                      background: 'var(--warning-50)', border: '1px solid var(--warning-100)',
                      borderRadius: '8px', fontSize: '12px', color: 'var(--warning-700)',
                      display: 'flex', alignItems: 'center', gap: '8px',
                    }}
                    role="note"
                  >
                    <Info size={13} aria-hidden="true" />
                    No live ESP32 data available. Enter sensor values manually below.
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
                  {SENSOR_FIELD_CONFIG.map(({ key, label, unit, icon: Icon, placeholder, min, max, step, help }) => (
                    <div className="form-field" key={key}>
                      <label className="form-label" htmlFor={`sensor-${key}`}>
                        <Icon size={11} aria-hidden="true" />
                        {label} ({unit})
                      </label>
                      <input
                        id={`sensor-${key}`}
                        className="form-input"
                        type="number"
                        name={key}
                        value={sensorForm[key]}
                        onChange={handleSensorChange}
                        placeholder={placeholder}
                        min={min} max={max} step={step}
                        aria-describedby={`sensor-help-${key}`}
                        aria-required="true"
                      />
                      <p id={`sensor-help-${key}`} className="form-help">{help}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Section 2: System Location ────────────────────── */}
              <div style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div
                      style={{
                        width: '28px', height: '28px', borderRadius: '6px',
                        background: 'var(--success-50)', color: 'var(--success-600)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                      aria-hidden="true"
                    >
                      <Monitor size={14} />
                    </div>
                    <div>
                      <p style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-heading)' }}>
                        System Location
                      </p>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        3 values from this computer — NOT from ESP32
                      </p>
                    </div>
                  </div>

                  {locationAllFilled && (
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={handleSaveLocation}
                      style={{
                        background: locationSaved ? 'var(--success-50)' : 'var(--primary-50)',
                        color: locationSaved ? 'var(--success-700)' : 'var(--primary-700)',
                        border: `1px solid ${locationSaved ? 'var(--success-200)' : 'var(--primary-200)'}`,
                      }}
                      title="Save location for the whole session"
                    >
                      <Save size={12} aria-hidden="true" />
                      {locationSaved ? 'Location Saved ✓' : 'Save Location'}
                    </button>
                  )}
                </div>

                {/* Clarification note */}
                <div
                  style={{
                    padding: '10px 14px', marginBottom: '12px',
                    background: 'var(--info-50)', border: '1px solid var(--info-100)',
                    borderRadius: '8px', fontSize: '12px', color: 'var(--info-600)',
                    display: 'flex', alignItems: 'center', gap: '8px',
                  }}
                  role="note"
                >
                  <Monitor size={13} aria-hidden="true" />
                  <span>
                    <strong>System Location:</strong> Latitude, Longitude and Elevation describe
                    where this monitoring station is physically located. The ESP32 has no GPS —
                    enter these values once and click "Save Location".
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                  {LOCATION_FIELD_CONFIG.map(({ key, label, unit, icon: Icon, placeholder, min, max, step, help }) => (
                    <div className="form-field" key={key}>
                      <label className="form-label" htmlFor={`loc-${key}`}>
                        <Icon size={11} aria-hidden="true" />
                        {label} ({unit})
                      </label>
                      <input
                        id={`loc-${key}`}
                        className="form-input"
                        type="number"
                        name={key}
                        value={locationForm[key]}
                        onChange={handleLocationChange}
                        placeholder={placeholder}
                        min={min} max={max} step={step}
                        aria-describedby={`loc-help-${key}`}
                        aria-required="true"
                        style={{
                          borderColor: locationSaved ? 'var(--success-300)' : undefined,
                          background: locationSaved ? 'var(--success-50)' : undefined,
                        }}
                      />
                      <p id={`loc-help-${key}`} className="form-help">{help}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Submit ─────────────────────────────────────────── */}
              {error && (
                <div className="api-error-bar" role="alert" style={{ marginBottom: '16px' }}>
                  <AlertTriangle size={14} aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  type="submit"
                  className="btn btn-primary btn-lg"
                  disabled={loading || !allFilled || apiStatus === 'offline'}
                  aria-busy={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 size={16} className="spin" aria-hidden="true" />
                      Running Prediction…
                    </>
                  ) : (
                    <>
                      <BrainCircuit size={16} aria-hidden="true" />
                      Run Flood Prediction
                    </>
                  )}
                </button>

                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => {
                    setSensorForm(INITIAL_SENSOR_FORM);
                    setResult(null);
                    setError(null);
                  }}
                  disabled={loading}
                >
                  Clear Sensor Inputs
                </button>

                {!allFilled && (
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {!sensorAllFilled && !locationAllFilled
                      ? 'Fill in all 7 fields to run prediction'
                      : !sensorAllFilled
                      ? 'Fill in all 4 ESP32 sensor fields'
                      : 'Fill in all 3 system location fields'}
                  </span>
                )}
              </div>
            </form>
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────────
            RESULT CARD
        ───────────────────────────────────────────────────────── */}
        <div
          className={`prediction-result ${result ? (isHigh ? 'high' : 'low') : 'empty'}`}
          role="region"
          aria-label="Model Classification Result"
          aria-live="polite"
        >
          {result ? (
            <>
              <div className="prediction-result-icon" aria-hidden="true">
                {isHigh ? <AlertTriangle size={30} /> : <ShieldCheck size={30} />}
              </div>

              <div>
                <p className="prediction-result-label">
                  Random Forest Model Result
                </p>
                <p className="prediction-result-title">
                  {result.status || (isHigh ? 'HIGH FLOOD ALERT' : 'NO FLOOD')}
                </p>
                <p className="prediction-result-sub" style={{ marginTop: '4px' }}>
                  {result.message ||
                    (isHigh
                      ? 'High flood alert! Elevated water level and rainfall conditions detected.'
                      : 'No flood conditions detected based on current environmental readings.')}
                </p>
              </div>

              {/* Input summary — clearly labeled by data source */}
              <div
                style={{
                  width: '100%',
                  background: isHigh ? 'rgba(239,68,68,0.07)' : 'rgba(34,197,94,0.07)',
                  border: `1px solid ${isHigh ? 'var(--danger-100)' : 'var(--success-100)'}`,
                  borderRadius: '10px', padding: '14px 16px',
                }}
              >
                {/* ESP32 sensor inputs */}
                <p style={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Cpu size={10} aria-hidden="true" />
                  ESP32 Sensor Readings Used
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '14px' }}>
                  {[
                    { l: 'Temperature', v: result.inputs.temperature, u: '°C' },
                    { l: 'Humidity', v: result.inputs.humidity, u: '%' },
                    { l: 'Rainfall', v: result.inputs.rainfall, u: 'mm' },
                    { l: 'Water Level', v: result.inputs.water_level, u: 'm' },
                  ].map(({ l, v, u }) => (
                    <div key={l} style={{ textAlign: 'left' }}>
                      <p style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.3px' }}>{l}</p>
                      <p style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>
                        {v} <span style={{ fontSize: '11px', fontWeight: '400', color: 'var(--text-muted)' }}>{u}</span>
                      </p>
                    </div>
                  ))}
                </div>

                {/* System location inputs */}
                <p style={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Monitor size={10} aria-hidden="true" />
                  System Location Used
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                  {[
                    { l: 'Latitude', v: result.inputs.latitude, u: '°' },
                    { l: 'Longitude', v: result.inputs.longitude, u: '°' },
                    { l: 'Elevation', v: result.inputs.elevation, u: 'm' },
                  ].map(({ l, v, u }) => (
                    <div key={l} style={{ textAlign: 'left' }}>
                      <p style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.3px' }}>{l}</p>
                      <p style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>
                        {v} <span style={{ fontSize: '11px', fontWeight: '400', color: 'var(--text-muted)' }}>{u}</span>
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {result.timestamp && (
                <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Clock size={11} aria-hidden="true" />
                  Predicted at: {formatTs(result.timestamp)}
                  {result.execution_time_ms != null && (
                    <span style={{ marginLeft: '8px', color: 'var(--primary-600)', fontWeight: 600 }}>
                      · Latency: {result.execution_time_ms} ms
                    </span>
                  )}
                </p>
              )}
            </>
          ) : (
            <>
              <div className="prediction-result-icon" aria-hidden="true">
                <HelpCircle size={28} />
              </div>
              <p className="prediction-result-title" style={{ fontSize: '18px' }}>
                No Prediction Yet
              </p>
              <p className="prediction-result-sub">
                Fill in the 4 ESP32 sensor readings and 3 system location values, then click
                "Run Flood Prediction" to see the ML model result.
              </p>
            </>
          )}
        </div>

        {/* Disclaimer */}
        <div
          style={{
            marginTop: '20px', padding: '12px 16px',
            background: '#f8fafc', borderRadius: '8px',
            border: '1px solid var(--border-light)',
            fontSize: '11.5px', color: 'var(--text-muted)', lineHeight: '1.6',
          }}
          role="note"
        >
          <strong style={{ color: 'var(--text-secondary)' }}>Model Information:</strong>{' '}
          Classifications are generated by the Random Forest model <code>flood_model_rf.pkl</code> via FastAPI <code>/predict/rf</code>. Output 1 represents a high flood alert under current readings; output 0 represents baseline conditions (no flood detected). Always follow official disaster management advisories.
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>
    </main>
  );
}
