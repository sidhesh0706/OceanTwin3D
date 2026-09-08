import { useState } from 'react';
import { Layers, Waves, Box, ScanLine, Upload, SlidersHorizontal, ChevronLeft } from 'lucide-react';
import type { Dataset, Mode, Variable } from '../types';

interface Props {
  dataset: Dataset;
  variable: Variable;
  setVariable: (v: Variable) => void;
  mode: Mode;
  setMode: (m: Mode) => void;
  depth: number;
  setDepth: (n: number) => void;
  opacity: number;
  setOpacity: (n: number) => void;
  exaggeration: number;
  setExaggeration: (n: number) => void;
  range: [number, number];
  setRange: (r: [number, number]) => void;
  argo: boolean;
  setArgo: (v: boolean) => void;
  gliders: boolean;
  setGliders: (v: boolean) => void;
  currents: boolean;
  setCurrents: (v: boolean) => void;
  grid: boolean;
  setGrid: (v: boolean) => void;
  density: number;
  setDensity: (n: number) => void;
  threshold: number;
  setThreshold: (n: number) => void;
  onUpload: () => void;
  onDemo: () => void;
  onCollapse: () => void;
  uploading: boolean;
}
function ColorRange({
  range,
  onChange,
}: {
  range: [number, number];
  onChange: (r: [number, number]) => void;
}) {
  const [min, setMin] = useState(String(range[0])),
    [max, setMax] = useState(String(range[1])),
    [invalid, setInvalid] = useState(false);
  function commit() {
    const a = Number(min),
      b = Number(max);
    if (min.trim() && max.trim() && Number.isFinite(a) && Number.isFinite(b) && a < b) {
      onChange([a, b]);
      setInvalid(false);
    } else setInvalid(true);
  }
  return (
    <>
      <div className="range-inputs">
        <label>
          MIN
          <input
            aria-label="Color minimum"
            type="number"
            step="any"
            value={min}
            onChange={(e) => setMin(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
            }}
          />
        </label>
        <span>—</span>
        <label>
          MAX
          <input
            aria-label="Color maximum"
            type="number"
            step="any"
            value={max}
            onChange={(e) => setMax(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
            }}
          />
        </label>
      </div>
      {invalid && <small className="error-text">Minimum must be less than maximum.</small>}
    </>
  );
}
export function Controls(p: Props) {
  const [advanced, setAdvanced] = useState(false);
  return (
    <aside className="panel controls">
      <div className="panel-heading">
        <span>
          <SlidersHorizontal size={13} /> EXPLORER
          <small className="panel-sub">ANALYZE · VISUALIZE · COMPARE</small>
        </span>
        <button className="icon-button" aria-label="Collapse controls" onClick={p.onCollapse}>
          <ChevronLeft size={16} />
        </button>
      </div>
      <div className="controls-body">
        <section>
          <span className="eyebrow">DATA LAYER</span>
          <div className="variable-options">
            {p.dataset.variables.map((v, i) => (
              <button
                key={v.id}
                className={p.variable === v.id ? 'active' : ''}
                onClick={() => p.setVariable(v.id)}
              >
                <span className={`variable-swatch ${v.id}`} />
                {v.name}
                <small>{String(i + 1).padStart(2, '0')}</small>
              </button>
            ))}
          </div>
        </section>
        <section>
          <span className="eyebrow">VISUALIZATION</span>
          <div className="mode-options">
            {(
              [
                { id: 'slice', label: 'Depth slice', Icon: Layers },
                { id: 'volume', label: '3D volume', Icon: Box },
                { id: 'currents', label: 'Current field', Icon: Waves },
              ] as const
            ).map(({ id, label, Icon }, i) => (
              <button
                key={id}
                disabled={id === 'currents' && !p.dataset.has_currents}
                className={p.mode === id ? 'active' : ''}
                onClick={() => p.setMode(id)}
              >
                <Icon size={15} />
                {label}
                <small>{String(i + 1).padStart(2, '0')}</small>
                <span className="radio-dot" />
              </button>
            ))}
          </div>
        </section>
        <section>
          <div className="section-title">
            <label className="eyebrow" htmlFor="depth-control">
              DEPTH
            </label>
            <span className="unit-label">METRES</span>
          </div>
          <div className="depth-measurement">
            {p.depth === 0 ? '0' : p.depth.toLocaleString()}
            <small>m</small>
            <span>
              {p.depth === 0
                ? 'Surface'
                : p.depth < 200
                  ? 'Upper ocean'
                  : p.depth < 1000
                    ? 'Mesopelagic'
                    : 'Deep ocean'}
            </span>
          </div>
          <input
            id="depth-control"
            type="range"
            min={p.dataset.bounds.depth[0]}
            max={p.dataset.bounds.depth[1]}
            step={10}
            value={p.depth}
            onChange={(e) => p.setDepth(+e.target.value)}
          />
          <div className="range-endpoints">
            <span>{p.dataset.bounds.depth[0]} m</span>
            <span>{p.dataset.bounds.depth[1].toLocaleString()} m</span>
          </div>
          <div className="depth-presets">
            {[0, 200, 500, 1000, 2000]
              .filter((v) => v >= p.dataset.bounds.depth[0] && v <= p.dataset.bounds.depth[1])
              .map((n) => (
                <button
                  key={n}
                  className={p.depth === n ? 'active' : ''}
                  onClick={() => p.setDepth(n)}
                >
                  {n === 0 ? 'SFC' : n}
                </button>
              ))}
          </div>
          {(p.mode === 'volume' || p.mode === 'iso') && (
            <small className="hint">Full column shown. Depth controls current layer.</small>
          )}
        </section>
        <section>
          <div className="section-title">
            <label className="eyebrow" htmlFor="opacity-control">
              OPACITY
            </label>
            <span>{Math.round(p.opacity * 100)}%</span>
          </div>
          <input
            id="opacity-control"
            aria-label="Opacity"
            type="range"
            min={0.05}
            max={1}
            step={0.05}
            value={p.opacity}
            onChange={(e) => p.setOpacity(+e.target.value)}
          />
          <div className="section-title scale-heading">
            <span
              className="eyebrow"
              title="Schematic depth scale. At 5×, depth is roughly 612× physical scale for the demo domain."
            >
              VERTICAL DISPLAY SCALE
            </span>
          </div>
          <div className="segmented">
            {[1, 2, 5, 10].map((n) => (
              <button
                key={n}
                className={p.exaggeration === n ? 'active' : ''}
                onClick={() => p.setExaggeration(n)}
              >
                {n}×
              </button>
            ))}
          </div>
        </section>
        <section>
          <span className="eyebrow">OVERLAYS</span>
          <div className="overlay-options">
            {[
              { name: 'Argo floats', value: p.argo, set: p.setArgo },
              { name: 'Gliders', value: p.gliders, set: p.setGliders },
              { name: 'Animated currents', value: p.currents, set: p.setCurrents },
              { name: 'Reference grid', value: p.grid, set: p.setGrid },
            ].map((o) => (
              <label key={o.name}>
                <span>{o.name}</span>
                <input
                  type="checkbox"
                  role="switch"
                  aria-label={o.name}
                  checked={o.value}
                  disabled={o.name === 'Animated currents' && !p.dataset.has_currents}
                  onChange={(e) => o.set(e.target.checked)}
                />
              </label>
            ))}
          </div>
        </section>
        <button
          className="advanced-button"
          aria-expanded={advanced}
          onClick={() => setAdvanced(!advanced)}
        >
          <SlidersHorizontal size={13} /> Color & rendering <span>{advanced ? '−' : '+'}</span>
        </button>
        {advanced && (
          <section className="advanced-settings">
            <ColorRange key={`${p.variable}-${p.range}`} range={p.range} onChange={p.setRange} />
            <button
              className="text-button"
              onClick={() =>
                p.setRange(p.dataset.variables.find((v) => v.id === p.variable)!.range)
              }
            >
              Reset color range
            </button>
            <label className="eyebrow" htmlFor="density">
              PARTICLE DENSITY
            </label>
            <select id="density" value={p.density} onChange={(e) => p.setDensity(+e.target.value)}>
              <option value={500}>Low · 500</option>
              <option value={1200}>Medium · 1,200</option>
              <option value={2200}>High · 2,200</option>
            </select>
            <button
              className={`iso-button ${p.mode === 'iso' ? 'active' : ''}`}
              onClick={() => p.setMode(p.mode === 'iso' ? 'slice' : 'iso')}
            >
              <ScanLine size={14} /> Isosurface preview
            </button>
            {p.mode === 'iso' && (
              <>
                <input
                  aria-label="Isosurface threshold"
                  type="range"
                  min={p.range[0]}
                  max={p.range[1]}
                  step={(p.range[1] - p.range[0]) / 100}
                  value={p.threshold}
                  onChange={(e) => p.setThreshold(+e.target.value)}
                />
                <small className="hint">
                  {p.threshold.toFixed(2)} · threshold points, ±2.5% of color range. Not a mesh.
                </small>
              </>
            )}
          </section>
        )}
        <button className="load-dataset" disabled={p.uploading} onClick={p.onUpload}>
          <Upload size={14} />
          {p.uploading ? 'Reading NetCDF…' : 'Load NetCDF dataset'}
          <span>.nc</span>
        </button>
        {!p.dataset.synthetic && (
          <button className="text-button" onClick={p.onDemo}>
            Restore demo model
          </button>
        )}
      </div>
    </aside>
  );
}
