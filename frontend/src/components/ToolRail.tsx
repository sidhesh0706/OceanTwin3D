import { useState } from 'react';
import {
  Globe,
  Layers,
  BarChart2,
  Settings,
  Box,
  Waves,
  Upload,
  ScanLine,
  X,
  Activity,
  MapPin,
  TrendingUp,
  Ruler,
} from 'lucide-react';
import type { CameraPreset, Dataset, Mode, Variable } from '../types';
import { ColorRangeInputs } from './ColorRangeInputs';

type Panel = 'view' | 'layers' | 'depth' | 'settings' | 'analysis' | null;

interface Props {
  local?: boolean;
  dataset: Dataset;
  preset: CameraPreset;
  onCamera: (p: CameraPreset) => void;
  variable: Variable;
  onVariable: (v: Variable) => void;
  mode: Mode;
  onMode: (m: Mode) => void;
  depth: number;
  onDepth: (n: number) => void;
  opacity: number;
  onOpacity: (n: number) => void;
  exaggeration: number;
  onExaggeration: (n: number) => void;
  argo: boolean;
  onArgo: (v: boolean) => void;
  gliders: boolean;
  onGliders: (v: boolean) => void;
  currents: boolean;
  onCurrents: (v: boolean) => void;
  grid: boolean;
  onGrid: (v: boolean) => void;
  density: number;
  onDensity: (n: number) => void;
  range: [number, number];
  onRange: (r: [number, number]) => void;
  threshold: number;
  onThreshold: (n: number) => void;
  onUpload: () => void;
  onDemo: () => void;
  uploading: boolean;
  onTransect?: () => void;
  onRegionStats?: () => void;
  onProfile?: () => void;
}

const GLOBAL_PRESETS: { id: CameraPreset; label: string; desc: string }[] = [
  { id: 'global', label: 'Earth', desc: 'Full global view' },
  { id: 'approach', label: 'Approach', desc: 'Descend toward domain' },
  { id: 'domain', label: 'Ocean Domain', desc: 'Fly to model domain' },
  { id: 'surface', label: 'Surface', desc: 'Ocean surface view' },
];

const BASIN_PRESETS: { id: CameraPreset; label: string; desc: string }[] = [
  { id: 'pacific', label: 'Pacific', desc: 'Central Pacific Ocean' },
  { id: 'atlantic', label: 'Atlantic', desc: 'Central Atlantic Ocean' },
  { id: 'indian', label: 'Indian', desc: 'Indian Ocean warm pool' },
  { id: 'southern', label: 'Southern', desc: 'Antarctic Circumpolar' },
  { id: 'arctic', label: 'Arctic', desc: 'Arctic Ocean' },
];

const DIVE_PRESETS: { id: CameraPreset; label: string; desc: string }[] = [
  { id: 'underwater', label: 'Underwater', desc: 'Dive below surface' },
  { id: 'dive-200m', label: '200 m', desc: 'Upper mesopelagic' },
  { id: 'dive-500m', label: '500 m', desc: 'Mesopelagic zone' },
  { id: 'dive-1000m', label: '1,000 m', desc: 'Bathypelagic zone' },
  { id: 'dive-2000m', label: '2,000 m', desc: 'Abyssal zone' },
];

export function ToolRail(p: Props) {
  const [open, setOpen] = useState<Panel>(null);
  const toggle = (panel: Panel) => setOpen((v) => (v === panel ? null : panel));

  return (
    <>
      {/* Icon rail */}
      <nav className="tool-rail" aria-label="Explorer tools">
        {(
          [
            { id: 'view', Icon: Globe, label: 'View' },
            { id: 'layers', Icon: Layers, label: 'Layers' },
            { id: 'depth', Icon: BarChart2, label: 'Depth' },
            { id: 'analysis', Icon: Activity, label: 'Analysis' },
            { id: 'settings', Icon: Settings, label: 'Settings' },
          ] as const
        ).map(({ id, Icon, label }) => (
          <button
            key={id}
            className={`tr-btn ${open === id ? 'active' : ''}`}
            aria-label={label}
            aria-pressed={open === id}
            onClick={() => toggle(id)}
          >
            <Icon size={19} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {/* VIEW PANEL */}
      {open === 'view' && (
        <div className="fp fp-view" role="dialog" aria-label="View panel">
          <FpHeader title="View" onClose={() => setOpen(null)} />
          <div className="fp-body">
            <p className="fp-section-label">GLOBAL</p>
            {GLOBAL_PRESETS.map(({ id, label, desc }) => (
              <button
                key={id}
                className={`fp-preset-btn ${p.preset === id ? 'active' : ''}`}
                onClick={() => {
                  p.onCamera(id);
                  setOpen(null);
                }}
              >
                <span className="fp-preset-label">{label}</span>
                <span className="fp-preset-desc">{desc}</span>
              </button>
            ))}
            <p className="fp-section-label" style={{ marginTop: 14 }}>
              OCEAN BASINS
            </p>
            {BASIN_PRESETS.map(({ id, label, desc }) => (
              <button
                key={id}
                className={`fp-preset-btn ${p.preset === id ? 'active' : ''}`}
                onClick={() => {
                  p.onCamera(id);
                  setOpen(null);
                }}
              >
                <span className="fp-preset-label">{label}</span>
                <span className="fp-preset-desc">{desc}</span>
              </button>
            ))}
            <p className="fp-section-label" style={{ marginTop: 14 }}>
              DIVE
            </p>
            {DIVE_PRESETS.filter((d) => {
              const depthM = parseInt(d.id.replace('dive-', '').replace('m', ''), 10);
              return isNaN(depthM) || depthM <= p.dataset.bounds.depth[1];
            }).map(({ id, label, desc }) => (
              <button
                key={id}
                className={`fp-preset-btn ${p.preset === id ? 'active' : ''}`}
                onClick={() => {
                  p.onCamera(id);
                  setOpen(null);
                }}
              >
                <span className="fp-preset-label">{label}</span>
                <span className="fp-preset-desc">{desc}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* LAYERS PANEL */}
      {open === 'layers' && (
        <div className="fp fp-layers" role="dialog" aria-label="Layers panel">
          <FpHeader title="Layers" onClose={() => setOpen(null)} />
          <div className="fp-body">
            <p className="fp-section-label">DATA LAYER</p>
            {p.dataset.variables.map((v) => (
              <button
                key={v.id}
                className={`fp-var-btn ${p.variable === v.id ? 'active' : ''}`}
                onClick={() => p.onVariable(v.id)}
              >
                <span className={`var-swatch ${v.id}`} />
                {v.name}
              </button>
            ))}
            <p className="fp-section-label" style={{ marginTop: 16 }}>
              VISUALIZATION
            </p>
            {(
              [
                { id: 'slice', label: 'Depth Slice', Icon: Layers },
                { id: 'volume', label: '3D Volume', Icon: Box },
                { id: 'currents', label: 'Current Field', Icon: Waves },
              ] as const
            ).map(({ id, label, Icon }) => (
              <button
                key={id}
                className={`fp-mode-btn ${p.mode === id ? 'active' : ''}`}
                disabled={id === 'currents' && !p.dataset.has_currents}
                onClick={() => p.onMode(id)}
              >
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* DEPTH PANEL */}
      {open === 'depth' && (
        <div className="fp fp-depth" role="dialog" aria-label="Depth panel">
          <FpHeader title="Depth" onClose={() => setOpen(null)} />
          <div className="fp-body">
            <div className="fp-depth-value">
              <strong>{p.depth === 0 ? '0' : p.depth.toLocaleString()}</strong>
              <span>m</span>
              <small>
                {p.depth === 0
                  ? 'Surface'
                  : p.depth < 200
                    ? 'Upper ocean'
                    : p.depth < 1000
                      ? 'Mesopelagic'
                      : 'Deep ocean'}
              </small>
            </div>
            <input
              aria-label="Depth"
              type="range"
              min={p.dataset.bounds.depth[0]}
              max={p.dataset.bounds.depth[1]}
              step={10}
              value={p.depth}
              onChange={(e) => p.onDepth(+e.target.value)}
            />
            <div className="fp-depth-presets">
              {[0, 200, 500, 1000, 2000]
                .filter((v) => v <= p.dataset.bounds.depth[1])
                .map((n) => (
                  <button
                    key={n}
                    className={p.depth === n ? 'active' : ''}
                    onClick={() => p.onDepth(n)}
                  >
                    {n === 0 ? 'SFC' : n}
                  </button>
                ))}
            </div>
            <p className="fp-section-label" style={{ marginTop: 16 }}>
              OPACITY
            </p>
            <div className="fp-row-val">
              <input
                aria-label="Opacity"
                type="range"
                min={0.05}
                max={1}
                step={0.05}
                value={p.opacity}
                onChange={(e) => p.onOpacity(+e.target.value)}
              />
              <span>{Math.round(p.opacity * 100)}%</span>
            </div>
            <p className="fp-section-label" style={{ marginTop: 12 }}>
              VERTICAL SCALE
            </p>
            <div className="fp-segmented">
              {[1, 2, 5, 10].map((n) => (
                <button
                  key={n}
                  className={p.exaggeration === n ? 'active' : ''}
                  onClick={() => p.onExaggeration(n)}
                >
                  {p.local ? n : n * 100}×
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ANALYSIS PANEL */}
      {open === 'analysis' && (
        <div className="fp fp-analysis" role="dialog" aria-label="Analysis panel">
          <FpHeader title="Analysis" onClose={() => setOpen(null)} />
          <div className="fp-body">
            <p className="fp-section-label">SPATIAL TOOLS</p>
            <button
              className="fp-analysis-btn"
              onClick={() => {
                p.onTransect?.();
                setOpen(null);
              }}
            >
              <Ruler size={14} />
              <span>
                <strong>Transect</strong>
                <small>Two endpoints · fixed-depth section</small>
              </span>
            </button>
            <button
              className="fp-analysis-btn"
              onClick={() => {
                p.onRegionStats?.();
                setOpen(null);
              }}
            >
              <TrendingUp size={14} />
              <span>
                <strong>Region Stats</strong>
                <small>Grid-cell mean · min · max · std</small>
              </span>
            </button>
            <button
              className="fp-analysis-btn"
              onClick={() => {
                p.onProfile?.();
                setOpen(null);
              }}
            >
              <MapPin size={14} />
              <span>
                <strong>Profile Probe</strong>
                <small>Click point · all variables</small>
              </span>
            </button>
            <div className="fp-divider" />
            <p className="fp-section-label">ISOSURFACE</p>
            <button
              className={`fp-iso-btn ${p.mode === 'iso' ? 'active' : ''}`}
              onClick={() => p.onMode(p.mode === 'iso' ? 'slice' : 'iso')}
            >
              <ScanLine size={13} /> Isosurface preview
            </button>
            {p.mode === 'iso' && (
              <input
                aria-label="Isosurface threshold"
                type="range"
                min={p.range[0]}
                max={p.range[1]}
                step={(p.range[1] - p.range[0]) / 100}
                value={p.threshold}
                onChange={(e) => p.onThreshold(+e.target.value)}
              />
            )}
          </div>
        </div>
      )}

      {/* SETTINGS PANEL */}
      {open === 'settings' && (
        <div className="fp fp-settings" role="dialog" aria-label="Settings panel">
          <FpHeader title="Settings" onClose={() => setOpen(null)} />
          <div className="fp-body">
            <p className="fp-section-label">OVERLAYS</p>
            {[
              { name: 'Argo floats', value: p.argo, set: p.onArgo },
              { name: 'Gliders', value: p.gliders, set: p.onGliders },
              { name: 'Current vectors', value: p.currents, set: p.onCurrents },
              { name: 'Reference grid', value: p.grid, set: p.onGrid },
            ].map((o) => (
              <label key={o.name} className="fp-toggle-row">
                <span>{o.name}</span>
                <input
                  type="checkbox"
                  role="switch"
                  aria-label={o.name}
                  checked={o.value}
                  onChange={(e) => o.set(e.target.checked)}
                />
              </label>
            ))}
            <p className="fp-section-label" style={{ marginTop: 16 }}>
              COLOR RANGE
            </p>
            <ColorRangeInputs
              range={p.range}
              onChange={p.onRange}
              onReset={() => p.onRange(p.dataset.variables.find((v) => v.id === p.variable)!.range)}
            />
            <p className="fp-section-label" style={{ marginTop: 14 }}>
              PARTICLE DENSITY
            </p>
            <select
              aria-label="Particle density"
              value={p.density}
              onChange={(e) => p.onDensity(+e.target.value)}
            >
              <option value={500}>Low · 500</option>
              <option value={1200}>Medium · 1,200</option>
              <option value={2200}>High · 2,200</option>
            </select>
            <div className="fp-divider" />
            <button className="fp-upload-btn" disabled={p.uploading} onClick={p.onUpload}>
              <Upload size={13} />
              {p.uploading ? 'Reading…' : 'Load NetCDF dataset'}
            </button>
            <button className="fp-text-btn" onClick={p.onDemo}>
              Restore demo model
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function FpHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="fp-header">
      <span>{title}</span>
      <button className="icon-button" aria-label={`Close ${title} panel`} onClick={onClose}>
        <X size={14} />
      </button>
    </div>
  );
}
