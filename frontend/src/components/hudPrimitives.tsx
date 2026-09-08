import type { ReactNode } from 'react';

// Shared visual primitives for the landing narrative and the scientific
// explorer. One system: technical labels, telemetry values, thin dividers,
// status indicators. Styling lives in styles.css so both experiences draw
// from the same tokens.
export function TechnicalLabel({ children }: { children: ReactNode }) {
  return <span className="hud-label">{children}</span>;
}

export function TelemetryValue({ children }: { children: ReactNode }) {
  return <strong className="hud-telemetry-value">{children}</strong>;
}

export function CoordinateReadout({
  latitude,
  longitude,
}: {
  latitude: number;
  longitude: number;
}) {
  const lat = `${Math.abs(latitude).toFixed(2)}° ${latitude < 0 ? 'S' : 'N'}`;
  const lon = `${Math.abs(longitude).toFixed(2)}° ${longitude < 0 ? 'W' : 'E'}`;
  return (
    <span className="hud-coordinates">
      {lat} · {lon}
    </span>
  );
}

export function HudDivider() {
  return <div className="hud-divider" aria-hidden="true" />;
}

export function StatusIndicator({ ready, text }: { ready: boolean; text: string }) {
  return (
    <span className="hud-status">
      <i className={ready ? '' : 'loading'} />
      {text}
    </span>
  );
}

export function SectionLabel({ index, children }: { index?: string; children: ReactNode }) {
  return (
    <span className="hud-section-label">
      {children}
      {index && <small>{index}</small>}
    </span>
  );
}
