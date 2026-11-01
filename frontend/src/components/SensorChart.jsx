/**
 * SensorChart – real-time line chart for a single sensor.
 * Uses Recharts. Shows threshold line from centralized config.
 * Displays empty/waiting state if no data is available.
 */
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
} from 'recharts';
import { Activity } from 'lucide-react';
import { THRESHOLDS } from '../config/thresholds';

const CustomTooltip = ({ active, payload, label, unit }) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: 'white',
        border: '1px solid var(--border-light)',
        borderRadius: '8px',
        padding: '10px 14px',
        boxShadow: 'var(--shadow-md)',
        fontSize: '12px',
      }}
    >
      <p style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color, fontWeight: 600 }}>
          {p.name}: {p.value} {unit}
        </p>
      ))}
    </div>
  );
};

export default function SensorChart({
  title,
  icon: Icon,
  data,         // array of { time: string, value: number }
  sensorKey,    // key in THRESHOLDS (e.g. 'temperature')
  unit,
  color = 'var(--primary-500)',
  currentValue,
}) {
  const threshold = THRESHOLDS[sensorKey];
  const hasData = Array.isArray(data) && data.length > 0;

  return (
    <div className="chart-card">
      {/* Header */}
      <div className="chart-header">
        <div className="chart-title-area">
          <div
            className="chart-icon-wrap"
            style={{ background: 'var(--primary-50)', color: 'var(--primary-600)' }}
            aria-hidden="true"
          >
            {Icon ? <Icon size={18} /> : <Activity size={18} />}
          </div>
          <div>
            <p className="chart-title">{title}</p>
            {threshold && (
              <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Project threshold: {threshold.value} {unit}
              </p>
            )}
          </div>
        </div>

        <div className="chart-current-val">
          {currentValue !== null && currentValue !== undefined ? (
            <>
              <span className="chart-current-number">{Number(currentValue).toFixed(1)}</span>
              <span className="chart-current-unit">{unit}</span>
            </>
          ) : (
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              No data
            </span>
          )}
        </div>
      </div>

      {/* Chart body */}
      <div className="chart-body">
        {hasData ? (
          <>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart
                data={data}
                margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--border-light)' }}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                  tickLine={false}
                  axisLine={false}
                  width={38}
                />
                <Tooltip content={<CustomTooltip unit={unit} />} />
                <Legend
                  wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
                  formatter={(value) =>
                    value === 'value' ? `Sensor Reading (${unit})` : value
                  }
                />

                {/* Threshold reference line */}
                {threshold && (
                  <ReferenceLine
                    y={threshold.value}
                    stroke="var(--danger-500)"
                    strokeDasharray="5 3"
                    strokeWidth={1.5}
                    label={{
                      value: `Threshold (${threshold.value}${unit})`,
                      position: 'insideTopRight',
                      fontSize: 10,
                      fill: 'var(--danger-600)',
                      fontWeight: 600,
                    }}
                    name="Threshold"
                  />
                )}

                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={color}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 5, strokeWidth: 0 }}
                  isAnimationActive={true}
                  animationDuration={500}
                  name="value"
                />
              </LineChart>
            </ResponsiveContainer>

            {/* Legend for threshold */}
            <div className="threshold-legend" aria-label="Chart legend">
              <div className="legend-item">
                <div className="legend-line sensor" />
                <span>Sensor Reading</span>
              </div>
              <div className="legend-item">
                <div
                  className="legend-line threshold"
                  style={{
                    background: 'none',
                    borderTop: '2px dashed var(--danger-500)',
                    height: '0px',
                    width: '20px',
                  }}
                />
                <span>Project Threshold</span>
              </div>
            </div>
          </>
        ) : (
          <div className="chart-empty" role="status" aria-label="Waiting for sensor data">
            <div className="chart-empty-icon" aria-hidden="true">
              <Activity size={22} />
            </div>
            <p className="chart-empty-text">Waiting for live sensor data</p>
            <p className="chart-empty-sub">
              Connect the ESP32 via Bluetooth to begin monitoring
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
