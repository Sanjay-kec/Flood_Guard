/**
 * Live Monitoring Page
 * Shows 4 real-time sensor charts.
 * Includes the ConnectionPanel that guides the user through ESP32 setup.
 * Data flows: ESP32 → BT → Python receiver.py → FastAPI /sensor → React (polls every 5s)
 */
import { useState, useEffect, useCallback } from 'react';
import { Thermometer, Droplets, CloudRain, Waves, RefreshCw, Info } from 'lucide-react';
import SensorChart from '../components/SensorChart';
import ConnectionPanel from '../components/ConnectionPanel';
import { getSensorData } from '../services/api';

const MAX_HISTORY = 60; // Data points kept per chart

function formatTime(date) {
  return date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function LiveMonitoring({ sensorData }) {
  const [history, setHistory] = useState({
    temperature: [],
    humidity: [],
    rainfall: [],
    waterLevel: [],
  });
  const [lastRefresh, setLastRefresh] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Append new ESP32 reading into chart history buffers
  useEffect(() => {
    if (!sensorData) return;
    const now = formatTime(new Date());

    setHistory((prev) => {
      const append = (key, val) => {
        if (val === null || val === undefined) return prev[key];
        const next = [...prev[key], { time: now, value: Number(val) }];
        return next.slice(-MAX_HISTORY);
      };
      return {
        temperature: append('temperature', sensorData.temperature),
        humidity: append('humidity', sensorData.humidity),
        rainfall: append('rainfall', sensorData.rainfall),
        waterLevel: append('waterLevel', sensorData.water_level),
      };
    });

    setLastRefresh(new Date());
  }, [sensorData]);

  // Manual refresh
  const handleManualRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await getSensorData();
      setLastRefresh(new Date());
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const totalPoints = Math.max(...Object.values(history).map((h) => h.length));

  const charts = [
    {
      title: 'Temperature',
      icon: Thermometer,
      sensorKey: 'temperature',
      histKey: 'temperature',
      unit: '°C',
      color: 'var(--warning-500)',
      currentValue: sensorData?.temperature,
    },
    {
      title: 'Humidity',
      icon: Droplets,
      sensorKey: 'humidity',
      histKey: 'humidity',
      unit: '%',
      color: 'var(--primary-500)',
      currentValue: sensorData?.humidity,
    },
    {
      title: 'Rainfall',
      icon: CloudRain,
      sensorKey: 'rainfall',
      histKey: 'rainfall',
      unit: 'mm',
      color: 'var(--info-500)',
      currentValue: sensorData?.rainfall,
    },
    {
      title: 'Water Level',
      icon: Waves,
      sensorKey: 'waterLevel',
      histKey: 'waterLevel',
      unit: 'm',
      color: 'var(--success-500)',
      currentValue: sensorData?.water_level,
    },
  ];

  return (
    <main id="main-content" aria-label="Live Monitoring">

      {/* ── Step-by-step connection guide ──────────────── */}
      <ConnectionPanel sensorData={sensorData} />

      {/* ── Chart header ────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '20px',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <h2
            className="section-title"
            style={{ margin: 0, fontSize: '15px' }}
            id="charts-heading"
          >
            Real-Time Sensor Charts — ESP32 via Bluetooth
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {totalPoints > 0
              ? `${totalPoints} reading(s) this session · Auto-updates every 5 seconds`
              : 'Waiting for sensor data · Auto-updates every 5 seconds when connected'}
            {lastRefresh && ` · Last update: ${formatTime(lastRefresh)}`}
          </p>
        </div>

        <button
          className="btn btn-outline btn-sm"
          onClick={handleManualRefresh}
          disabled={isRefreshing}
          aria-label="Refresh sensor data"
        >
          <RefreshCw
            size={13}
            style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }}
            aria-hidden="true"
          />
          {isRefreshing ? 'Refreshing…' : 'Refresh Now'}
        </button>
      </div>

      {/* ── Charts ──────────────────────────────────────── */}
      <div className="grid-2" role="list" aria-labelledby="charts-heading">
        {charts.map((chart) => (
          <div key={chart.sensorKey} role="listitem">
            <SensorChart
              title={chart.title}
              icon={chart.icon}
              data={history[chart.histKey]}
              sensorKey={chart.sensorKey}
              unit={chart.unit}
              color={chart.color}
              currentValue={chart.currentValue}
            />
          </div>
        ))}
      </div>

      {/* Threshold note */}
      <div
        style={{
          marginTop: '24px',
          padding: '14px 16px',
          background: '#f8fafc',
          border: '1px solid var(--border-light)',
          borderRadius: '10px',
          fontSize: '12px',
          color: 'var(--text-muted)',
          lineHeight: '1.6',
        }}
        role="note"
      >
        <strong style={{ color: 'var(--text-secondary)' }}>Note on Thresholds:</strong> The
        dashed red lines represent configurable project thresholds from{' '}
        <code>src/config/thresholds.js</code>. These are not official government thresholds.
        Adjust them to match your deployment requirements.
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </main>
  );
}
