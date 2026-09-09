import { useState } from 'react';
import { ChevronRight, Box, Waves, Globe } from 'lucide-react';
import type { Dataset, Frame, Mode, Observation, Variable } from '../types';
import { gradient } from '../ocean/colors';
import { stamp } from '../services/api';

interface Props {
  dataset: Dataset;
  frame: Frame;
  variable: Variable;
  onVariable: (v: Variable) => void;
  mode: Mode;
  onMode: (m: Mode) => void;
  range: [number, number];
  depth: number;
  onDepth: (n: number) => void;
  observations: Observation[];
  argo: boolean;
  gliders: boolean;
  busy: boolean;
  baseName: string;
  onSelect: (o: Observation) => void;
}

const VAR_COLORS: Record<string, string> = {
  temperature: '#eb9d7c',
  salinity: '#a6bce7',
  chlorophyll: '#9dcc8e',
  current_speed: '#d6a1c3',
};

export function RightPanel({
  dataset,
  frame,
  variable,
  onVariable,
  mode,
  onMode,
  range,
  depth,
  onDepth,
  observations,
  argo,
  gliders,
  busy,
  baseName,
  onSelect,
}: Props) {
  const [obsOpen, setObsOpen] = useState(false);
  const meta = dataset.variables.find((v) => v.id === variable)!;
  const argoCount = observations.filter((o) => o.instrument_type === 'ARGO' && argo).length;
  const gliderCount = observations.filter((o) => o.instrument_type === 'GLIDER' && gliders).length;
  const otherCount = observations.filter(
    (o) => !['ARGO', 'GLIDER'].includes(o.instrument_type) && (argo || gliders),
  ).length;

  // Domain label
  const [latS, latN] = dataset.bounds.latitude.map((v) => +v.toFixed(2));
  const [lonW, lonE] = dataset.bounds.longitude.map(
    (v) => +(((((v + 180) % 360) + 360) % 360) - 180).toFixed(2),
  );
  const latLabel = `${Math.abs(latS)}°${latS < 0 ? 'S' : 'N'} – ${Math.abs(latN)}°${latN < 0 ? 'S' : 'N'}`;
  const lonLabel = dataset.global
    ? 'Global · All Basins (180°W – 180°E)'
    : `${Math.abs(lonW)}°${lonW < 0 ? 'W' : 'E'} – ${Math.abs(lonE)}°${lonE < 0 ? 'W' : 'E'}`;

  return (
    <aside className="right-panel" aria-label="Active layer controls">
      {/* ── Active Layer ───────────────────────────────────── */}
      <section className="rp-section">
        <div className="rp-section-hd">
          <span>Active Layer</span>
          <span className="rp-dash">—</span>
        </div>

        {/* Variable selector */}
        <div className="rp-var-row">
          <span className="rp-var-dot" style={{ background: VAR_COLORS[variable] ?? '#aaa' }} />
          <select
            aria-label="Scientific variable"
            value={variable}
            onChange={(e) => onVariable(e.target.value as Variable)}
          >
            {dataset.variables.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>

        {/* Colorbar */}
        <div className="rp-colorbar">
          <div
            className="rp-colorbar-bar"
            style={{ background: gradient(variable) }}
            aria-label={`Color scale for ${variable}`}
          />
          <div className="rp-colorbar-ticks">
            {[0, 0.25, 0.5, 0.75, 1].map((t) => (
              <span key={t}>{(range[0] + (range[1] - range[0]) * t).toFixed(1)}</span>
            ))}
            <span className="rp-unit">{meta.units}</span>
          </div>
        </div>

        {/* Viz mode buttons */}
        <div className="rp-viz-modes">
          <button
            className={mode === 'slice' ? 'active' : ''}
            onClick={() => onMode('slice')}
            aria-label="Depth slice mode"
          >
            <Globe size={13} />
            <span>Depth slice</span>
          </button>
          <button
            className={mode === 'volume' ? 'active' : ''}
            onClick={() => onMode('volume')}
            aria-label="3D volume mode"
          >
            <Box size={13} />
            <span>3D Volume</span>
          </button>
          <button
            className={mode === 'currents' ? 'active' : ''}
            onClick={() => onMode('currents')}
            disabled={!dataset.has_currents}
            aria-label="Current field mode"
          >
            <Waves size={13} />
            <span>Currents</span>
          </button>
        </div>
      </section>

      {/* ── Depth ─────────────────────────────────────────── */}
      <section className="rp-section">
        <div className="rp-depth-hd">
          <span>Depth</span>
          <strong>
            {depth === 0 ? '0' : depth.toLocaleString()}
            <small> m</small>
          </strong>
        </div>
        <input
          aria-label="Depth"
          type="range"
          min={dataset.bounds.depth[0]}
          max={dataset.bounds.depth[1]}
          step={10}
          value={depth}
          onChange={(e) => onDepth(+e.target.value)}
        />
        <div className="rp-depth-ticks">
          {[0, 200, 500, 1000, dataset.bounds.depth[1]]
            .filter((v, i, a) => a.indexOf(v) === i && v <= dataset.bounds.depth[1])
            .map((n) => (
              <span key={n}>{n === 0 ? '0' : n >= 1000 ? `${n / 1000}k` : n}</span>
            ))}
        </div>
      </section>

      {/* ── Observations ──────────────────────────────────── */}
      <section className="rp-section">
        <button
          className="rp-obs-toggle"
          aria-expanded={obsOpen}
          onClick={() => setObsOpen((v) => !v)}
        >
          <span>Observations</span>
          <ChevronRight size={14} className={obsOpen ? 'rotated' : ''} />
        </button>
        <div className="rp-obs-counts">
          <div>
            <span className="obs-argo-dot" />
            Argo Floats
            <strong>{argoCount}</strong>
          </div>
          <div>
            <span className="obs-glider-dot" />
            Gliders
            <strong>{gliderCount}</strong>
          </div>
          {otherCount > 0 && (
            <div>
              <span className="obs-glider-dot" style={{ background: '#4EA4FF' }} />
              CTD / BGC
              <strong>{otherCount}</strong>
            </div>
          )}
        </div>
        {obsOpen && (
          <div className="rp-sensor-list">
            {observations
              .filter((o) => (o.instrument_type === 'ARGO' ? argo : gliders))
              .map((o) => (
                <button key={o.id} onClick={() => onSelect(o)}>
                  {o.id}
                  <small>
                    {o.instrument_type} · {o.max_depth} m
                  </small>
                </button>
              ))}
            {!observations.length && <p>No observations attached to this model.</p>}
          </div>
        )}
      </section>

      {/* ── Model Info Card ────────────────────────────────── */}
      <section className="rp-section rp-model-card">
        <div className="rp-model-hd">
          <span>
            {dataset.synthetic
              ? dataset.global
                ? 'Global Ocean Model · 3D Digital Twin'
                : 'Ocean Model · Demo Domain'
              : dataset.name}
          </span>
          <span className="rp-active-badge">
            <i className={busy ? 'loading' : ''} />
            {busy ? 'Updating' : 'Active'}
          </span>
        </div>
        <dl className="rp-model-dl">
          <div>
            <dt>Model Time</dt>
            <dd>{stamp(frame.slice.timestamp)}</dd>
          </div>
          <div>
            <dt>Grid</dt>
            <dd>{Object.values(dataset.grid).join(' × ')}</dd>
          </div>
          <div>
            <dt>Domain</dt>
            <dd>
              {latLabel}
              <br />
              {lonLabel}
            </dd>
          </div>
          <div>
            <dt>Water Column</dt>
            <dd>
              {dataset.depths.length} levels · {dataset.bounds.depth[1].toLocaleString()} m
            </dd>
          </div>
        </dl>
        {baseName && <p className="rp-attr">{baseName}</p>}
      </section>
    </aside>
  );
}
