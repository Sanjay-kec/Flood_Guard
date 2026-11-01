/**
 * ConnectionPanel – step-by-step guide for connecting the ESP32.
 * Shown on the Live Monitoring page when no sensor data has been received.
 * Collapses once data is flowing.
 */
import { useState } from 'react';
import {
  Cpu,
  Bluetooth,
  Radio,
  Server,
  Terminal,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Circle,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-react';

function CodeBlock({ code, label }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      style={{
        position: 'relative',
        background: '#0f172a',
        borderRadius: '8px',
        padding: '12px 16px',
        marginTop: '8px',
      }}
    >
      {label && (
        <p style={{ fontSize: '10px', color: '#64748b', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {label}
        </p>
      )}
      <code style={{ fontSize: '12.5px', color: '#7dd3fc', fontFamily: 'monospace', display: 'block', lineHeight: '1.6' }}>
        {code}
      </code>
      <button
        onClick={copy}
        title="Copy to clipboard"
        style={{
          position: 'absolute', top: '10px', right: '10px',
          background: 'rgba(255,255,255,0.1)', border: 'none',
          borderRadius: '5px', padding: '4px 8px', cursor: 'pointer',
          color: copied ? '#4ade80' : '#94a3b8', fontSize: '11px',
          display: 'flex', alignItems: 'center', gap: '4px',
        }}
      >
        {copied ? <Check size={11} /> : <Copy size={11} />}
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </div>
  );
}

const STEPS = [
  {
    icon: Cpu,
    title: 'Power on your ESP32',
    description: 'Ensure your ESP32 is running the FloodGuard sketch. It should be sending sensor readings (Temperature, Humidity, Rainfall, Water Level) via Bluetooth Serial.',
    status: 'pending',
  },
  {
    icon: Bluetooth,
    title: 'Pair ESP32 via Windows Bluetooth',
    description: (
      <span>
        Go to <strong>Settings → Bluetooth & devices → Add device</strong> and pair your ESP32.
        After pairing, check <strong>Device Manager → Ports (COM & LPT)</strong> to find its COM port (e.g. <code>COM5</code>).
      </span>
    ),
    status: 'pending',
  },
  {
    icon: Server,
    title: 'Start the FastAPI backend',
    description: 'Run the FastAPI server (port 8000). Keep this terminal open.',
    code: 'cd "e:\\resume Project\\Flood_Risk_ESP32_Project"\npython -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000',
    status: 'pending',
  },
  {
    icon: Radio,
    title: 'Install Bluetooth receiver dependencies',
    description: 'Install pyserial and requests if not already installed.',
    code: 'pip install pyserial requests',
    status: 'pending',
  },
  {
    icon: Terminal,
    title: 'Start the Bluetooth receiver',
    description: 'Run the receiver script in a new terminal. Replace COM5 with your actual ESP32 COM port. It will automatically forward data to FastAPI.',
    code: 'cd "e:\\resume Project\\Flood_Risk_ESP32_Project"\npython bluetooth/receiver.py --port COM5',
    status: 'pending',
  },
];

export default function ConnectionPanel({ sensorData }) {
  const [isExpanded, setIsExpanded] = useState(!sensorData);
  const isConnected = !!sensorData;

  if (isConnected && !isExpanded) {
    return (
      <div
        style={{
          background: 'var(--success-50)',
          border: '1px solid var(--success-100)',
          borderRadius: '10px',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '20px',
        }}
        role="status"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <CheckCircle2 size={18} style={{ color: 'var(--success-500)' }} aria-hidden="true" />
          <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--success-700)' }}>
            ESP32 connected — live sensor data is being received
          </span>
        </div>
        <button
          onClick={() => setIsExpanded(true)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: '11px', color: 'var(--success-600)', display: 'flex',
            alignItems: 'center', gap: '4px',
          }}
          aria-label="Show connection guide"
        >
          Show guide <ChevronDown size={13} />
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-light)',
        borderRadius: '14px',
        boxShadow: 'var(--shadow-sm)',
        marginBottom: '24px',
        overflow: 'hidden',
      }}
      role="region"
      aria-label="ESP32 Connection Guide"
    >
      {/* Header */}
      <div
        style={{
          padding: '16px 20px',
          background: isConnected ? 'var(--success-50)' : 'var(--primary-50)',
          borderBottom: '1px solid var(--border-light)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
        }}
        onClick={() => setIsExpanded(!isExpanded)}
        role="button"
        aria-expanded={isExpanded}
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setIsExpanded(!isExpanded)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {isConnected
            ? <CheckCircle2 size={18} style={{ color: 'var(--success-500)' }} aria-hidden="true" />
            : <Bluetooth size={18} style={{ color: 'var(--primary-600)' }} aria-hidden="true" />
          }
          <div>
            <p style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-heading)' }}>
              {isConnected ? 'ESP32 Connected' : 'How to Connect Your ESP32'}
            </p>
            <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '1px' }}>
              {isConnected
                ? 'Live data is flowing. Click to see the connection guide.'
                : 'Follow these steps to start receiving live sensor data'}
            </p>
          </div>
        </div>
        <button
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
          aria-label={isExpanded ? 'Collapse guide' : 'Expand guide'}
        >
          {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
      </div>

      {/* Steps */}
      {isExpanded && (
        <div style={{ padding: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {STEPS.map((step, idx) => {
              const Icon = step.icon;
              const isDone = isConnected && idx < 2; // First 2 steps implied done if connected
              return (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    gap: '14px',
                    padding: '14px',
                    background: isDone ? 'var(--success-50)' : '#f8fafc',
                    border: `1px solid ${isDone ? 'var(--success-100)' : 'var(--border-light)'}`,
                    borderRadius: '10px',
                  }}
                >
                  {/* Step number / icon */}
                  <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                    <div
                      style={{
                        width: '32px', height: '32px', borderRadius: '8px',
                        background: isDone ? 'var(--success-100)' : 'var(--primary-50)',
                        color: isDone ? 'var(--success-600)' : 'var(--primary-600)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                      aria-hidden="true"
                    >
                      {isDone ? <CheckCircle2 size={16} /> : <Icon size={16} />}
                    </div>
                    <span
                      style={{
                        width: '20px', height: '20px', borderRadius: '50%',
                        background: isDone ? 'var(--success-500)' : 'var(--primary-600)',
                        color: 'white', fontSize: '11px', fontWeight: '700',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                      aria-label={`Step ${idx + 1}`}
                    >
                      {idx + 1}
                    </span>
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: '13.5px', fontWeight: '700', color: 'var(--text-heading)', marginBottom: '4px' }}>
                      {step.title}
                    </p>
                    <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                      {step.description}
                    </p>
                    {step.code && <CodeBlock code={step.code} />}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ESP32 JSON format note */}
          <div
            style={{
              marginTop: '16px',
              padding: '14px 16px',
              background: '#0f172a',
              borderRadius: '10px',
            }}
            role="note"
          >
            <p style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Required ESP32 sketch output format (one JSON line per reading)
            </p>
            <code style={{ fontSize: '12px', color: '#7dd3fc', fontFamily: 'monospace', display: 'block', lineHeight: '1.8' }}>
              {`SerialBT.println(`}<br />
              {'  '}
              <span style={{ color: '#86efac' }}>{`"{\\"temperature\\":28.5,\\"humidity\\":75.0,\\"rainfall\\":12.0,\\"water_level\\":1.8}"`}</span><br />
              {`);`}
            </code>
            <p style={{ fontSize: '11px', color: '#475569', marginTop: '8px' }}>
              Or comma-separated: <code style={{ color: '#fbbf24' }}>28.5,75.0,12.0,1.8</code> (temp,humidity,rainfall,waterlevel)
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
