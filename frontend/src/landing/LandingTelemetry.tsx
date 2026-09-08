import { TechnicalLabel, TelemetryValue } from '../components/hudPrimitives';

export interface Telemetry {
  latitude: number;
  longitude: number;
  altitude: number;
}

function lat(value: number) {
  return `${Math.abs(value).toFixed(2)}° ${value < 0 ? 'S' : 'N'}`;
}
function lon(value: number) {
  return `${Math.abs(value).toFixed(2)}° ${value < 0 ? 'W' : 'E'}`;
}
function alt(metres: number) {
  if (metres >= 10000)
    return `${(metres / 1000).toLocaleString('en-US', { maximumFractionDigits: 0 })} km`;
  if (metres >= 1000) return `${(metres / 1000).toFixed(1)} km`;
  return `${Math.max(0, metres).toFixed(0)} m`;
}

// Monospace instrument readout of the cinematic camera. Telemetry only —
export default function LandingTelemetry({ value }: { value: Telemetry | null }) {
  if (!value) return null;
  return (
    <div className="landing-telemetry" aria-label="Camera telemetry">
      <div>
        <TechnicalLabel>LAT</TechnicalLabel>
        <TelemetryValue>{lat(value.latitude)}</TelemetryValue>
      </div>
      <div>
        <TechnicalLabel>LON</TechnicalLabel>
        <TelemetryValue>{lon(value.longitude)}</TelemetryValue>
      </div>
      <div>
        <TechnicalLabel>ALT</TechnicalLabel>
        <TelemetryValue>{alt(value.altitude)}</TelemetryValue>
      </div>
    </div>
  );
}
