/**
 * FloodGuard - Centralized API Service
 *
 * All HTTP communication with the FastAPI backend goes through this module.
 * Do NOT add fetch/axios calls in components directly.
 *
 * FastAPI backend base URL: http://127.0.0.1:8000
 * Endpoints:
 *   GET  /         → health check / API info
 *   GET  /health   → detailed health + model_loaded status
 *   GET  /sensor   → latest ESP32 sensor readings
 *   POST /sensor   → receive ESP32 data (called by Bluetooth receiver)
 *   POST /sensor/disconnect → mark ESP32 as disconnected
 *   POST /predict/rf → Random Forest flood risk prediction
 *   GET  /alerts   → alert history placeholder
 */

import axios from 'axios';

const BASE_URL = 'http://127.0.0.1:8000';

const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 8000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ─── Error Message Normalizer ───────────────────────────────────────────────

/**
 * Normalizes FastAPI and Axios error objects into a human-readable string.
 * Supports:
 *   - FastAPI detail string: { detail: "Model is unavailable" }
 *   - FastAPI detail array (Pydantic 422): { detail: [{ loc: ["body", "rainfall"], msg: "Field required" }] }
 *   - Legacy/generic error formats: { error: "..." }, { message: "..." }
 *   - Network / timeout / offline errors
 *
 * @param {any} error
 * @returns {string}
 */
export function extractErrorMessage(error) {
  const data = error?.response?.data;

  // 1. Check FastAPI 'detail' field (string, array, or object)
  if (data?.detail !== undefined && data?.detail !== null) {
    if (typeof data.detail === 'string') {
      return data.detail;
    }

    // Handle Pydantic validation error array: [{ loc: [...], msg: "..." }]
    if (Array.isArray(data.detail)) {
      const messages = data.detail
        .map((item) => {
          if (typeof item === 'string') return item;
          if (item?.msg) {
            const field =
              Array.isArray(item.loc) && item.loc.length > 0
                ? item.loc[item.loc.length - 1]
                : null;
            return field && field !== 'body' ? `${field}: ${item.msg}` : item.msg;
          }
          return JSON.stringify(item);
        })
        .filter(Boolean);

      if (messages.length > 0) {
        return messages.join('; ');
      }
    }

    // Handle structured object detail
    if (typeof data.detail === 'object') {
      return data.detail.message || data.detail.error || JSON.stringify(data.detail);
    }
  }

  // 2. Check legacy / alternative fields
  if (typeof data?.error === 'string') {
    return data.error;
  }
  if (typeof data?.message === 'string') {
    return data.message;
  }

  // 3. Fallback for network / server-unreachable errors
  if (error?.code === 'ECONNABORTED') {
    return 'Request timed out. Please check if the FastAPI server is responsive.';
  }
  if (error?.code === 'ERR_NETWORK' || (!error?.response && error?.message === 'Network Error')) {
    return 'Cannot connect to backend server. Make sure FastAPI is running at http://127.0.0.1:8000.';
  }

  return error?.message || 'Unknown error occurred';
}

// ─── Request / Response Interceptors ────────────────────────────────────────

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = extractErrorMessage(error);
    return Promise.reject({
      message,
      status: error?.response?.status ?? null,
      originalError: error,
    });
  }
);

// ─── API Functions ───────────────────────────────────────────────────────────

/**
 * Health check – confirms FastAPI is reachable.
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
export async function getApiStatus() {
  try {
    const { data } = await apiClient.get('/');
    // FastAPI returns JSON: { status: 'ok', message: '...' }
    const msg = typeof data === 'object' ? data.message : String(data);
    return { ok: true, message: msg || 'API running' };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

/**
 * Run flood prediction via the Random Forest model.
 * Calls FastAPI POST /predict/rf
 *
 * @param {{
 *   latitude: number,
 *   longitude: number,
 *   rainfall: number,
 *   temperature: number,
 *   humidity: number,
 *   water_level: number,
 *   elevation: number,
 * }} payload – exact 7 field names expected by FastAPI /predict/rf
 *
 * @returns {Promise<{
 *   prediction: 0|1,
 *   status: 'NO FLOOD'|'HIGH FLOOD ALERT',
 *   message: string,
 *   id?: number|null,
 *   timestamp?: string|null
 * }>}
 */
export async function predictFlood(payload) {
  const { data } = await apiClient.post('/predict/rf', payload);
  return data;
}

/**
 * Get latest ESP32 sensor data from FastAPI.
 *
 * IMPORTANT: The ESP32 has NO GPS module.
 * This endpoint returns ONLY the 4 physical sensor readings:
 *   temperature, humidity, rainfall, water_level
 *
 * FastAPI GET /sensor returns:
 *   { connected: false, data: null }         — when no ESP32 data received yet
 *   { connected: true, data: {...}, timestamp } — when ESP32 is connected
 *
 * Returns the data object on success, null when not connected.
 */
export async function getSensorData() {
  try {
    const { data } = await apiClient.get('/sensor');
    // FastAPI returns 200 always; check the connected flag
    if (!data || data.connected === false) {
      return {
        connected: false,
        led_status: data?.led_status || null,
      };
    }
    // Return the nested data object with reading timestamp and led_status
    return {
      connected: true,
      ...(data.data || {}),
      timestamp: data.timestamp || null,
      led_status: data.led_status || null,
    };
  } catch {
    return null;
  }
}

/**
 * Get physical ESP32 LED hardware actuation and sync status.
 */
export async function getLedStatus() {
  try {
    const { data } = await apiClient.get('/sensor/led-status');
    return data;
  } catch {
    return null;
  }
}

/**
 * Get system component statuses from FastAPI.
 * Returns null until /status endpoint is implemented.
 */
export async function getSystemStatus() {
  try {
    const { data } = await apiClient.get('/status');
    return data;
  } catch {
    return null;
  }
}

/**
 * Get alert history from FastAPI.
 * Currently returns an empty list — alert history managed in React session state.
 */
export async function getAlertHistory() {
  try {
    const { data } = await apiClient.get('/alerts');
    return data;
  } catch {
    return null;
  }
}

/**
 * Get Twilio SMS Gateway operational status, limits, and whitelist.
 */
export async function getSmsStatus() {
  try {
    const { data } = await apiClient.get('/sms/status');
    return data;
  } catch {
    return null;
  }
}

/**
 * Get recent SMS dispatch logs from the MySQL database.
 */
export async function getSmsHistory(limit = 50) {
  try {
    const { data } = await apiClient.get(`/sms/history?limit=${limit}`);
    return data?.logs || [];
  } catch {
    return [];
  }
}

/**
 * Dispatch a protected test SMS to the verified mobile number.
 *
 * @param {{ phone_number?: string, note?: string }} payload
 */
export async function sendTestSms(payload = {}) {
  const { data } = await apiClient.post('/sms/test-send', payload);
  return data;
}

export default apiClient;
