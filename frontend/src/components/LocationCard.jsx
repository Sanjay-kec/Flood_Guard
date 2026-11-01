/**
 * LocationCard – displays system/computer location.
 *
 * ARCHITECTURE NOTE:
 * Latitude and Longitude are SYSTEM LOCATION values configured on the computer.
 * They do NOT come from the ESP32.
 * The ESP32 has no GPS module.
 *
 * Elevation is also a system-configured value.
 *
 * Shows "Not Configured" if no system location has been set yet.
 */
import { MapPin, Navigation, Mountain, Monitor } from 'lucide-react';

export default function LocationCard({ latitude, longitude, elevation }) {
  const hasLocation =
    latitude !== null && latitude !== undefined &&
    longitude !== null && longitude !== undefined;

  const format = (val, decimals = 4) =>
    val !== null && val !== undefined ? Number(val).toFixed(decimals) : null;

  const items = [
    {
      label: 'Latitude',
      icon: Navigation,
      value: format(latitude),
      unit: '°',
      description: 'System-configured latitude',
    },
    {
      label: 'Longitude',
      icon: MapPin,
      value: format(longitude),
      unit: '°',
      description: 'System-configured longitude',
    },
    {
      label: 'Elevation',
      icon: Mountain,
      value: format(elevation, 1),
      unit: 'm',
      description: 'Above sea level',
    },
  ];

  return (
    <div className="location-card" role="region" aria-label="System location information">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <div
          style={{
            width: '32px', height: '32px',
            background: 'var(--primary-50)',
            color: 'var(--primary-600)',
            borderRadius: '8px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          aria-hidden="true"
        >
          <MapPin size={16} />
        </div>
        <div>
          <p style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-heading)' }}>
            Location &amp; Elevation
          </p>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Monitor size={10} aria-hidden="true" />
            {hasLocation
              ? 'System Location — configured on this computer'
              : 'System Location — not yet configured'}
          </p>
        </div>

        {/* Location source badge */}
        <div
          style={{ marginLeft: 'auto' }}
        >
          <span
            className="tag tag-blue"
            title="Location is provided by this computer, not by the ESP32"
          >
            <Monitor size={10} aria-hidden="true" />
            System Location
          </span>
        </div>
      </div>

      <div className="location-grid">
        {items.map(({ label, icon: Icon, value, unit, description }) => (
          <div
            className="location-item"
            key={label}
            aria-label={`${label}: ${value !== null ? `${value} ${unit}` : 'Not Configured'}`}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
              <Icon size={12} style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
              <span className="location-item-label">{label}</span>
            </div>

            {value !== null ? (
              <>
                <span className="location-item-value">
                  {value}
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '3px' }}>
                    {unit}
                  </span>
                </span>
                <span className="location-item-sub">{description}</span>
              </>
            ) : (
              <span
                className="location-item-value"
                style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '12px' }}
              >
                Not Configured
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Clarification note */}
      <div
        style={{
          marginTop: '12px',
          padding: '8px 12px',
          background: '#f8fafc',
          borderRadius: '8px',
          border: '1px solid var(--border-light)',
          fontSize: '11px',
          color: 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}
        role="note"
      >
        <Monitor size={11} aria-hidden="true" />
        <span>
          <strong>Source:</strong> Latitude, Longitude and Elevation are system-configured values
          on this computer. The ESP32 does not have a GPS module.
        </span>
      </div>
    </div>
  );
}
