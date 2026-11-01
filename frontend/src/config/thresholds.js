/**
 * FloodGuard - Centralized Sensor Threshold Configuration
 *
 * These thresholds are configurable project thresholds.
 * They are NOT official government flood thresholds.
 * Adjust these values based on your ESP32 sensor specifications
 * and the specific deployment location of your monitoring system.
 *
 * All thresholds should be reviewed and confirmed with domain experts
 * before deployment in a real flood monitoring context.
 */

export const THRESHOLDS = {
  temperature: {
    value: 40,          // °C – above this is considered elevated for flood correlation
    unit: '°C',
    label: 'Temperature Threshold',
    description: 'High temperature can accelerate glacial melt contributing to flood risk',
  },
  humidity: {
    value: 85,          // % – high humidity often precedes heavy rainfall
    unit: '%',
    label: 'Humidity Threshold',
    description: 'High humidity indicates potential for heavy precipitation',
  },
  rainfall: {
    value: 80,          // mm – heavy rainfall threshold per monitoring interval
    unit: 'mm',
    label: 'Rainfall Threshold',
    description: 'Sustained heavy rainfall is a primary flood trigger',
  },
  waterLevel: {
    value: 3.0,         // m – water level above which risk is elevated
    unit: 'm',
    label: 'Water Level Threshold',
    description: 'Rising water level directly indicates potential flood conditions',
  },
};

/**
 * Returns the status of a sensor reading relative to its threshold.
 * @param {string} sensor - key in THRESHOLDS
 * @param {number} value
 * @returns {'normal' | 'warning' | 'danger'}
 */
export function getSensorStatus(sensor, value) {
  const threshold = THRESHOLDS[sensor];
  if (!threshold) return 'normal';
  const ratio = value / threshold.value;
  if (ratio >= 1.0) return 'danger';
  if (ratio >= 0.8) return 'warning';
  return 'normal';
}

/**
 * Returns a human-readable status label.
 */
export function getSensorStatusLabel(sensor, value) {
  const status = getSensorStatus(sensor, value);
  return status === 'danger' ? 'Critical' : status === 'warning' ? 'Warning' : 'Normal';
}
