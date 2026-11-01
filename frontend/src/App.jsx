/**
 * FloodGuard – Root Application Component
 *
 * CORRECT DATA ARCHITECTURE:
 * ─────────────────────────────────────────────────────────────────
 * ESP32 (via Bluetooth → Python receiver → FastAPI):
 *   sensorData: { temperature, humidity, rainfall, water_level }
 *   ↑ ESP32 has NO GPS module. These are the only 4 sensor readings.
 *
 * Computer/System:
 *   systemLocation: { latitude, longitude, elevation }
 *   ↑ These are configured on the computer, NOT from ESP32.
 *   ↑ Managed in this component as a separate state object.
 * ─────────────────────────────────────────────────────────────────
 *
 * Global state managed here:
 *   - apiStatus:      'checking' | 'online' | 'offline'
 *   - sensorData:     { temperature, humidity, rainfall, water_level } | null
 *   - systemLocation: { latitude, longitude, elevation } | null
 *   - lastPrediction: result of most recent /predict call
 *   - alertHistory:   array of all predictions this session
 *   - sidebarOpen:    mobile sidebar toggle
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Routes, Route } from 'react-router-dom';

import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './pages/Dashboard';
import LiveMonitoring from './pages/LiveMonitoring';
import FloodPrediction from './pages/FloodPrediction';
import Alerts from './pages/Alerts';
import SystemStatus from './pages/SystemStatus';
import ErrorBoundary from './components/ErrorBoundary';

import { getApiStatus, getSensorData, getAlertHistory, predictFlood } from './services/api';

const API_POLL_INTERVAL = 15000;   // 15s – check FastAPI availability
const SENSOR_POLL_INTERVAL = 2000; // 2s  – poll for ESP32 sensor data (matches 2s Bluetooth stream)

export default function App() {
  const [apiStatus, setApiStatus] = useState('checking');
  // ESP32 sensor readings (temperature, humidity, rainfall, water_level only)
  const [sensorData, setSensorData] = useState(null);
  // System/computer-side location (NOT from ESP32 GPS) - restored from localStorage if available
  const [systemLocation, setSystemLocation] = useState(() => {
    try {
      const saved = localStorage.getItem('floodguard_station_location');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [lastPrediction, setLastPrediction] = useState(null);
  const [alertHistory, setAlertHistory] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [ledStatus, setLedStatus] = useState(null);

  // ── Auto-Prediction State (OFF by default) ──────────────────────────────
  const [autoPredictEnabled, setAutoPredictEnabled] = useState(false);
  const [lastAutoPredictTime, setLastAutoPredictTime] = useState(null);
  const isAutoPredictingRef = useRef(false);
  const lastAutoPredictTimestampRef = useRef(0);
  const lastEvaluatedSensorRef = useRef(null);

  const COOLDOWN_MS = 12000; // 12s rate limit between automatic predictions (responsive and safe)

  // Location validation: must have valid lat (-90..90), lon (-180..180), elevation (0..9000)
  const isLocationValid = useCallback((loc) => {
    if (!loc) return false;
    const lat = Number(loc.latitude);
    const lon = Number(loc.longitude);
    const elev = Number(loc.elevation);
    return (
      !isNaN(lat) && lat >= -90 && lat <= 90 &&
      !isNaN(lon) && lon >= -180 && lon <= 180 &&
      !isNaN(elev) && elev >= 0 && elev <= 9000
    );
  }, []);

  // Compute status description for UI
  const autoPredictStatus = (() => {
    if (!autoPredictEnabled) {
      return { active: false, code: 'off', message: 'Auto-Prediction is paused (manual mode).' };
    }
    if (!isLocationValid(systemLocation)) {
      return { active: false, code: 'no_location', message: 'Auto-prediction skipped: Monitoring location missing or invalid. Set Latitude, Longitude, and Elevation.' };
    }
    if (!sensorData) {
      return { active: false, code: 'no_telemetry', message: 'Auto-prediction skipped: Waiting for live ESP32 telemetry via Bluetooth…' };
    }
    if (sensorData.timestamp) {
      const ageMs = Date.now() - new Date(sensorData.timestamp).getTime();
      if (ageMs > 30000) {
        return { active: false, code: 'stale_telemetry', message: `Auto-prediction skipped: ESP32 telemetry is stale (${Math.round(ageMs / 1000)}s old). No recent readings.` };
      }
    }
    const elapsed = Date.now() - lastAutoPredictTimestampRef.current;
    if (elapsed < COOLDOWN_MS && lastEvaluatedSensorRef.current !== null) {
      const remainingSec = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
      return { active: true, code: 'cooldown', message: `Active · Rate limited (cooldown: ${remainingSec}s remaining).` };
    }
    return { active: true, code: 'monitoring', message: 'Active · Monitoring live telemetry (12s cooldown & threshold filter active).' };
  })();

  // ── API Health Check ─────────────────────────────────────────────────────
  const checkApi = useCallback(async () => {
    setApiStatus((prev) => (prev === 'offline' ? 'checking' : prev));
    const { ok } = await getApiStatus();
    setApiStatus(ok ? 'online' : 'offline');
  }, []);

  useEffect(() => {
    checkApi();
    const timer = setInterval(checkApi, API_POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [checkApi]);

// ── Origin Persistence Helpers (localStorage) ─────────────────────────────
const ORIGINS_STORAGE_KEY = 'floodguard_alert_origins';

function getStoredOrigins() {
  try {
    const raw = localStorage.getItem(ORIGINS_STORAGE_KEY);
    if (!raw) return { by_id: {}, by_timestamp: {} };
    const parsed = JSON.parse(raw);
    return {
      by_id: typeof parsed.by_id === 'object' && parsed.by_id !== null ? parsed.by_id : {},
      by_timestamp: typeof parsed.by_timestamp === 'object' && parsed.by_timestamp !== null ? parsed.by_timestamp : {},
    };
  } catch {
    return { by_id: {}, by_timestamp: {} };
  }
}

function saveStoredOrigin({ id, dbTimestamp, clientTimestamp, mode }) {
  if (mode !== 'auto' && mode !== 'manual' && mode !== 'telemetry_eval') return;
  try {
    const current = getStoredOrigins();
    if (id != null) {
      current.by_id[String(id)] = mode;
    }
    if (dbTimestamp) {
      current.by_timestamp[String(dbTimestamp)] = mode;
    }
    if (clientTimestamp) {
      current.by_timestamp[String(clientTimestamp)] = mode;
    }
    localStorage.setItem(ORIGINS_STORAGE_KEY, JSON.stringify(current));
  } catch (err) {
    console.warn('[FloodGuard] Failed to save alert origin to localStorage:', err);
  }
}

function mergeOriginsIntoAlerts(alerts, storedOrigins) {
  if (!Array.isArray(alerts)) return [];
  const { by_id, by_timestamp } = storedOrigins;

  return alerts.map((alert) => {
    if (alert.mode === 'auto' || alert.mode === 'manual' || alert.mode === 'telemetry_eval') {
      return alert;
    }

    let matchedMode = null;

    // 1. Prefer database ID match
    if (alert.id != null && by_id && by_id[String(alert.id)]) {
      matchedMode = by_id[String(alert.id)];
    }
    // 2. Exact timestamp match
    else if (alert.timestamp && by_timestamp && by_timestamp[String(alert.timestamp)]) {
      matchedMode = by_timestamp[String(alert.timestamp)];
    }
    // 3. Carefully checked timestamp tolerance (within 2 seconds)
    else if (alert.timestamp && by_timestamp) {
      const alertTime = new Date(alert.timestamp).getTime();
      if (!isNaN(alertTime)) {
        for (const [storedTs, mode] of Object.entries(by_timestamp)) {
          const storedTime = new Date(storedTs).getTime();
          if (!isNaN(storedTime) && Math.abs(alertTime - storedTime) <= 2000) {
            matchedMode = mode;
            break;
          }
        }
      }
    }

    if (matchedMode === 'auto' || matchedMode === 'manual' || matchedMode === 'telemetry_eval') {
      return { ...alert, mode: matchedMode };
    }

    // Unmatched origin remains undefined -> defaults to 'LOG' badge
    return alert;
  });
}

  // ── Load Historical Alerts from MySQL on Mount ───────────────────────────
  useEffect(() => {
    const fetchHistory = async () => {
      const res = await getAlertHistory();
      if (res && Array.isArray(res.alerts) && res.alerts.length > 0) {
        const storedOrigins = getStoredOrigins();
        const merged = mergeOriginsIntoAlerts(res.alerts, storedOrigins);
        setAlertHistory(merged);
        // Explicitly tag initial prediction loaded from MySQL as historical snapshot
        const initialPrediction = {
          ...merged[0],
          isHistorical: true,
        };
        setLastPrediction((prev) => (prev ? prev : initialPrediction));
      }
    };
    fetchHistory();
  }, []);

  // ── ESP32 Sensor Data Polling ────────────────────────────────────────────
  // getSensorData() returns data when an ESP32 reading has been forwarded
  // by the Python Bluetooth receiver to FastAPI /sensor.
  // IMPORTANT: Sensor data contains ONLY: temperature, humidity, rainfall,
  // water_level. No latitude/longitude/elevation from ESP32.
  useEffect(() => {
    const pollSensor = async () => {
      const res = await getSensorData();
      if (res && res.connected) {
        const { temperature, humidity, rainfall, water_level, timestamp, led_status } = res;
        setSensorData({ temperature, humidity, rainfall, water_level, timestamp });
        if (led_status) setLedStatus(led_status);
      } else {
        setSensorData(null);
        if (res?.led_status) setLedStatus(res.led_status);
      }
    };
    pollSensor();
    const timer = setInterval(pollSensor, SENSOR_POLL_INTERVAL);
    return () => clearInterval(timer);
  }, []);

  // ── Prediction Callback ──────────────────────────────────────────────────
  const handleNewPrediction = useCallback((result) => {
    const originMode = result.mode === 'auto' || result.mode === 'manual' || result.mode === 'telemetry_eval' ? result.mode : null;
    const alertId = result.id != null ? result.id : null;
    const alertTimestamp = result.timestamp || new Date().toISOString();

    const normalizedResult = {
      ...result,
      id: alertId,
      timestamp: alertTimestamp,
      isHistorical: false,
    };

    if (result?.target_led) {
      setLedStatus({
        target_command: result.target_led,
        hardware_state: result.hardware_led_state || 'UNKNOWN',
        synced: Boolean(result.hardware_led_synced),
        receiver_connected: Boolean(result.receiver_connected),
      });
    }

    // Save origin mapping to localStorage using the prediction's own ID and timestamp
    if (originMode) {
      saveStoredOrigin({
        id: alertId,
        dbTimestamp: alertTimestamp,
        clientTimestamp: alertTimestamp,
        mode: originMode,
      });
    }

    setLastPrediction(normalizedResult);
    setAlertHistory((prev) => [normalizedResult, ...prev]);
  }, []);

  // ── Telemetry Evaluation Action ──────────────────────────────────────────
  const [isEvaluatingTelemetry, setIsEvaluatingTelemetry] = useState(false);
  const [evalTelemetryError, setEvalTelemetryError] = useState(null);
  const [evalTelemetrySuccess, setEvalTelemetrySuccess] = useState(null);

  const handleEvaluateTelemetry = useCallback(async () => {
    if (isEvaluatingTelemetry) return;
    setEvalTelemetryError(null);
    setEvalTelemetrySuccess(null);

    if (!sensorData) {
      setEvalTelemetryError('No live ESP32 sensor telemetry available. Ensure Bluetooth receiver is running on COM9.');
      return;
    }

    if (!isLocationValid(systemLocation)) {
      setEvalTelemetryError('Monitoring location (Latitude, Longitude, Elevation) is missing or invalid. Please configure it in System Location.');
      return;
    }

    if (sensorData.timestamp) {
      const ageMs = Date.now() - new Date(sensorData.timestamp).getTime();
      if (ageMs > 30000) {
        setEvalTelemetryError(`ESP32 telemetry is stale (${Math.round(ageMs / 1000)}s old). Wait for fresh readings from COM9 before evaluating.`);
        return;
      }
    }

    setIsEvaluatingTelemetry(true);
    try {
      const payload = {
        latitude: parseFloat(systemLocation.latitude),
        longitude: parseFloat(systemLocation.longitude),
        elevation: parseFloat(systemLocation.elevation),
        rainfall: parseFloat(sensorData.rainfall),
        temperature: parseFloat(sensorData.temperature),
        humidity: parseFloat(sensorData.humidity),
        water_level: parseFloat(sensorData.water_level),
      };

      const data = await predictFlood(payload);
      const enriched = {
        ...data,
        timestamp: data.timestamp || new Date().toISOString(),
        id: data.id ?? null,
        inputs: { ...payload },
        mode: 'telemetry_eval',
        isHistorical: false,
      };

      if (data?.target_led) {
        setLedStatus({
          target_command: data.target_led,
          hardware_state: data.hardware_led_state || 'UNKNOWN',
          synced: Boolean(data.hardware_led_synced),
          receiver_connected: Boolean(data.receiver_connected),
        });
      }

      lastEvaluatedSensorRef.current = { ...sensorData };
      lastAutoPredictTimestampRef.current = Date.now();
      handleNewPrediction(enriched);

      const ledDetail = (data?.hardware_led_synced && data?.hardware_led_state !== 'UNKNOWN')
        ? ` · Physical LED: ${data.hardware_led_state} (GPIO 23)`
        : data?.receiver_connected
        ? ` · Transmitting ${data.target_led} to ESP32 (Awaiting Hardware ACK)...`
        : ` · Command queued (${data?.target_led || 'LED_OFF'}, Receiver Offline)`;

      setEvalTelemetrySuccess(`Current telemetry evaluated: ${enriched.status}${ledDetail} (Execution: ${enriched.execution_time_ms ?? 'N/A'}ms)`);
    } catch (err) {
      setEvalTelemetryError(err?.message || 'Failed to evaluate current telemetry with Random Forest model.');
    } finally {
      setIsEvaluatingTelemetry(false);
    }
  }, [isEvaluatingTelemetry, sensorData, systemLocation, isLocationValid, handleNewPrediction]);

  // ── Auto-Prediction Toggle Handler ───────────────────────────────────────
  const handleToggleAutoPredict = useCallback((enabled) => {
    setAutoPredictEnabled(enabled);
    if (enabled) {
      // Clear last evaluated sensor so an initial evaluation can trigger immediately
      lastEvaluatedSensorRef.current = null;
      lastAutoPredictTimestampRef.current = 0;
    }
  }, []);

  // ── Auto-Prediction Runner ────────────────────────────────────────────────
  // Runs ONLY when enabled AND station location is valid AND fresh live sensorData is present.
  // Performs initial evaluation immediately, followed by rate-limited delta filtering.
  useEffect(() => {
    if (!autoPredictEnabled) return;
    if (!isLocationValid(systemLocation)) return;
    if (!sensorData) return;
    if (isAutoPredictingRef.current) return;

    // Check for stale telemetry
    if (sensorData.timestamp) {
      const ageMs = Date.now() - new Date(sensorData.timestamp).getTime();
      if (ageMs > 30000) return;
    }

    const now = Date.now();
    const prev = lastEvaluatedSensorRef.current;

    // Initial evaluation triggered upon enabling
    let shouldRun = false;
    if (!prev) {
      shouldRun = true;
    } else {
      if (now - lastAutoPredictTimestampRef.current < COOLDOWN_MS) {
        return;
      }
      const current = sensorData;
      const dWater = Math.abs(Number(current.water_level) - Number(prev.water_level));
      const dRain = Math.abs(Number(current.rainfall) - Number(prev.rainfall));
      const dTemp = Math.abs(Number(current.temperature) - Number(prev.temperature));
      const dHum = Math.abs(Number(current.humidity) - Number(prev.humidity));
      if (dWater >= 0.05 || dRain >= 2.0 || dTemp >= 0.5 || dHum >= 2.0) {
        shouldRun = true;
      }
    }

    if (!shouldRun) return;

    isAutoPredictingRef.current = true;
    (async () => {
      try {
        const payload = {
          latitude: parseFloat(systemLocation.latitude),
          longitude: parseFloat(systemLocation.longitude),
          elevation: parseFloat(systemLocation.elevation),
          rainfall: parseFloat(sensorData.rainfall),
          temperature: parseFloat(sensorData.temperature),
          humidity: parseFloat(sensorData.humidity),
          water_level: parseFloat(sensorData.water_level),
        };

        const data = await predictFlood(payload);
        const enriched = {
          ...data,
          timestamp: data.timestamp || new Date().toISOString(),
          id: data.id ?? null,
          inputs: { ...payload },
          mode: 'auto',
          isHistorical: false,
        };
        lastAutoPredictTimestampRef.current = Date.now();
        lastEvaluatedSensorRef.current = { ...sensorData };
        setLastAutoPredictTime(new Date());
        handleNewPrediction(enriched);
      } catch (err) {
        console.error('[Auto-Predict Error]', err);
      } finally {
        isAutoPredictingRef.current = false;
      }
    })();
  }, [sensorData, autoPredictEnabled, systemLocation, isLocationValid, handleNewPrediction]);

  // ── System Location Update ───────────────────────────────────────────────
  // Called when the user updates system location. Persists to localStorage.
  const handleSystemLocationUpdate = useCallback((location) => {
    setSystemLocation(location);
    try {
      if (location) {
        localStorage.setItem('floodguard_station_location', JSON.stringify(location));
      } else {
        localStorage.removeItem('floodguard_station_location');
      }
    } catch {
      // Ignore localStorage write failures
    }
  }, []);

  // ── Sidebar ──────────────────────────────────────────────────────────────
  const toggleSidebar = () => setSidebarOpen((o) => !o);
  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="app-layout">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={closeSidebar}
        apiStatus={apiStatus}
      />

      <div className="app-main">
        <Header
          onMenuToggle={toggleSidebar}
          apiStatus={apiStatus}
          sensorData={sensorData}
        />

        <div className="app-content">
          <ErrorBoundary fallbackTitle="Unable to Load Page">
            <Routes>
              <Route
                path="/"
                element={
                  <Dashboard
                    sensorData={sensorData}
                    systemLocation={systemLocation}
                    onSystemLocationUpdate={handleSystemLocationUpdate}
                    apiStatus={apiStatus}
                    lastPrediction={lastPrediction}
                    ledStatus={ledStatus}
                    autoPredictEnabled={autoPredictEnabled}
                    onToggleAutoPredict={handleToggleAutoPredict}
                    autoPredictStatus={autoPredictStatus}
                    lastAutoPredictTime={lastAutoPredictTime}
                    onEvaluateTelemetry={handleEvaluateTelemetry}
                    isEvaluatingTelemetry={isEvaluatingTelemetry}
                    evalTelemetryError={evalTelemetryError}
                    evalTelemetrySuccess={evalTelemetrySuccess}
                  />
                }
              />

              <Route
                path="/live-monitoring"
                element={<LiveMonitoring sensorData={sensorData} />}
              />

              <Route
                path="/flood-prediction"
                element={
                  <FloodPrediction
                    apiStatus={apiStatus}
                    onNewPrediction={handleNewPrediction}
                    sensorData={sensorData}
                    systemLocation={systemLocation}
                    onSystemLocationUpdate={handleSystemLocationUpdate}
                  />
                }
              />

              <Route
                path="/alerts"
                element={
                  <Alerts
                    lastPrediction={lastPrediction}
                    alertHistory={alertHistory}
                    sensorData={sensorData}
                    systemLocation={systemLocation}
                    ledStatus={ledStatus}
                    onEvaluateTelemetry={handleEvaluateTelemetry}
                    isEvaluatingTelemetry={isEvaluatingTelemetry}
                    evalTelemetryError={evalTelemetryError}
                    evalTelemetrySuccess={evalTelemetrySuccess}
                  />
                }
              />

              <Route
                path="/system-status"
                element={
                  <SystemStatus
                    apiStatus={apiStatus}
                    sensorData={sensorData}
                    systemLocation={systemLocation}
                    onCheckApi={checkApi}
                  />
                }
              />

              {/* 404 fallback */}
              <Route
                path="*"
                element={
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minHeight: '60vh',
                      gap: '16px',
                      textAlign: 'center',
                    }}
                  >
                    <p style={{ fontSize: '48px', fontWeight: '800', color: 'var(--text-muted)' }}>
                      404
                    </p>
                    <p style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                      Page Not Found
                    </p>
                    <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
                      The page you requested does not exist.
                    </p>
                  </div>
                }
              />
            </Routes>
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}
