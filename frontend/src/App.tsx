import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Waves,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  Expand,
  Shrink,
  Compass,
  ChevronRight,
  X,
  CircleHelp,
  ArrowDown,
  Radio,
  SlidersHorizontal,
} from 'lucide-react';
import type {
  CameraPreset,
  Dataset,
  Field,
  Frame,
  Inspection,
  Land,
  Mode,
  Observation,
  Variable,
} from './types';
import { api, request, stamp, validateDataset, validateField } from './services/api';
import OceanScene from './ocean/OceanScene';
import { gradient } from './ocean/colors';
import { Controls } from './components/Controls';
import { Inspector } from './components/Inspector';
import { useModelContext } from './services/useModelContext';

const defaultRanges: Record<Variable, [number, number]> = {
  temperature: [2, 31],
  salinity: [33, 37],
  chlorophyll: [0, 2],
  current_speed: [0, 1],
};
const modeNames: Record<Mode, string> = {
  slice: 'Depth slice',
  volume: '3D volume',
  currents: 'Current field',
  iso: 'Isosurface preview',
};
export default function App() {
  const [dataset, setDataset] = useState<Dataset | null>(null),
    [observations, setObservations] = useState<Observation[]>([]),
    [land, setLand] = useState<Land | null>(null);
  const [variable, setVariable] = useState<Variable>('temperature'),
    [mode, setMode] = useState<Mode>('slice'),
    [depth, setDepth] = useState(0),
    [time, setTime] = useState(0);
  const [opacity, setOpacity] = useState(0.85),
    [exaggeration, setExaggeration] = useState(5),
    [range, setRange] = useState<[number, number]>([2, 31]),
    [threshold, setThreshold] = useState(20);
  const [argo, setArgo] = useState(true),
    [gliders, setGliders] = useState(true),
    [currents, setCurrents] = useState(true),
    [grid, setGrid] = useState(true),
    [density, setDensity] = useState(1200);
  const [frame, setFrame] = useState<Frame | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0);
  const [playing, setPlaying] = useState(false),
    [selected, setSelected] = useState<Observation | null>(null),
    [inspection, setInspection] = useState<Inspection | null>(null),
    [compare, setCompare] = useState(false);
  const [presentation, setPresentation] = useState(false),
    [collapsed, setCollapsed] = useState(false),
    [help, setHelp] = useState(false),
    [tour, setTour] = useState(-1);
  const [preset, setPreset] = useState<CameraPreset>('regional'),
    [cameraKey, setCameraKey] = useState(0),
    [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null),
    volumeCache = useRef(new Map<string, Field>()),
    inspectionRequest = useRef<AbortController | null>(null),
    bootstrapId = useRef(0);
  useModelContext({
    dataset: dataset?.id ?? null,
    synthetic: dataset?.synthetic ?? null,
    variable: frame?.slice.variable ?? null,
    depth: frame?.slice.depth ?? null,
    time: frame?.slice.timestamp ?? null,
    mode,
    selectedInstrument: selected?.id ?? null,
    updating: busy,
  });

  const bootstrap = useCallback(async () => {
    const id = ++bootstrapId.current;
    setBusy(true);
    setError('');
    try {
      const [datasets, sensors] = await Promise.all([api.datasets(), api.observations()]);
      if (id !== bootstrapId.current) return;
      const d = validateDataset(datasets[0]);
      setDataset(d);
      setObservations(sensors);
      setVariable(d.variables[0].id);
      setRange(d.synthetic ? defaultRanges[d.variables[0].id] : d.variables[0].range);
      setThreshold((d.variables[0].range[0] + d.variables[0].range[1]) / 2);
      setDepth(d.depths[0]);
      setTime(0);
      setFrame(null);
      setSelected(null);
      setInspection(null);
      setPlaying(false);
      setMode('slice');
      setCurrents(d.has_currents);
      volumeCache.current.clear();
      setRevision((v) => v + 1);
    } catch (e) {
      if (id === bootstrapId.current) {
        setError(e instanceof Error ? e.message : 'Ocean data service unavailable');
        setBusy(false);
      }
    }
  }, []);
  useEffect(() => {
    void bootstrap();
    request<Land>('/land.geojson')
      .then(setLand)
      .catch(() => {
        /* Model coordinate labels remain if geography is unavailable. */
      });
    return () => {
      bootstrapId.current++;
    };
  }, [bootstrap]);

  useEffect(() => {
    if (!dataset) return;
    inspectionRequest.current?.abort();
    const controller = new AbortController();
    setBusy(true);
    setError('');
    const delay = window.setTimeout(async () => {
      try {
        const key = `${revision}-${variable}-${time}`;
        const [slice, volume, current] = await Promise.all([
          api.field(variable, time, depth, controller.signal),
          volumeCache.current.has(key)
            ? Promise.resolve(volumeCache.current.get(key)!)
            : api.field(variable, time, null, controller.signal),
          dataset.has_currents
            ? api.currents(time, depth, controller.signal)
            : Promise.resolve(null),
        ]);
        if (controller.signal.aborted) return;
        validateField(slice);
        validateField(volume);
        if (
          current &&
          (!current.u?.length ||
            !current.v?.length ||
            current.latitudes.length < 2 ||
            current.longitudes.length < 2)
        )
          throw new Error('The current field is incomplete.');
        volumeCache.current.set(key, volume);
        if (volumeCache.current.size > 24)
          volumeCache.current.delete(volumeCache.current.keys().next().value!);
        setFrame({ slice, volume, currents: current });
        setInspection(null);
      } catch (e) {
        if (!controller.signal.aborted) {
          setError(e instanceof Error ? e.message : 'Could not prepare ocean data');
          setPlaying(false);
        }
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    }, 120);
    return () => {
      controller.abort();
      inspectionRequest.current?.abort();
      window.clearTimeout(delay);
    };
  }, [dataset, variable, time, depth, revision]);

  useEffect(() => {
    if (!playing || busy || !dataset) return;
    const t = window.setTimeout(() => setTime((v) => (v + 1) % dataset.times.length), 1250);
    return () => window.clearTimeout(t);
  }, [playing, busy, dataset, time]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches('input,select,textarea,button')) return;
      if (e.key.toLowerCase() === 'p') setPresentation((v) => !v);
      if (e.code === 'Space') {
        e.preventDefault();
        setPlaying((v) => !v);
      }
      if (e.key === 'Escape') {
        setHelp(false);
        setTour(-1);
        setPresentation(false);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  const select = (obs: Observation | null) => {
    inspectionRequest.current?.abort();
    setSelected(obs);
    setInspection(null);
  };
  useEffect(() => {
    if (tour < 0 || !dataset) return;
    setPlaying(false);
    switch (tour) {
      case 0:
        setVariable('temperature');
        setRange(defaultRanges.temperature);
        setDepth(0);
        setMode('slice');
        setTime(0);
        setPreset('regional');
        setCameraKey((v) => v + 1);
        setSelected(null);
        break;
      case 1:
        setDepth(500);
        break;
      case 2:
        setMode('volume');
        break;
      case 3:
        setCurrents(true);
        setTime(Math.min(4, dataset.times.length - 1));
        break;
      case 4:
        setArgo(true);
        setSelected(observations[0] ?? null);
        setCompare(true);
        break;
      default:
        setTour(-1);
        return;
    }
    const timer = window.setTimeout(() => setTour((v) => v + 1), 5500);
    return () => window.clearTimeout(timer);
  }, [tour, dataset, observations]);
  function chooseVariable(v: Variable) {
    setVariable(v);
    setRange(
      dataset?.synthetic ? defaultRanges[v] : dataset!.variables.find((m) => m.id === v)!.range,
    );
    setThreshold(v === 'temperature' ? 20 : (defaultRanges[v][0] + defaultRanges[v][1]) / 2);
  }
  function chooseMode(m: Mode) {
    setMode(m);
    if (m === 'currents') setCurrents(true);
  }
  function camera(p: CameraPreset) {
    setPreset(p);
    setCameraKey((v) => v + 1);
  }
  async function inspect(lat: number, lon: number) {
    if (!frame) return;
    inspectionRequest.current?.abort();
    const controller = new AbortController();
    inspectionRequest.current = controller;
    try {
      const value = await api.inspect(
        lat,
        lon,
        frame.slice.depth ?? 0,
        frame.slice.time,
        controller.signal,
      );
      if (!controller.signal.aborted) {
        setInspection(value);
        setSelected(null);
      }
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : 'Could not inspect this location.');
    }
  }
  async function upload(file: File) {
    setUploading(true);
    setPlaying(false);
    try {
      const body = new FormData();
      body.append('file', file);
      await request<Dataset>('/api/datasets/upload', { method: 'POST', body });
      await bootstrap();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load this NetCDF file.');
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }
  async function restore() {
    try {
      await request<Dataset>('/api/datasets/demo', { method: 'POST' });
      await bootstrap();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to restore demo.');
    }
  }

  if (!dataset || !frame)
    return (
      <div className="initialization">
        <div className="init-brand">
          <Waves size={40} />
          <h1>
            OceanTwin<span>OCEAN INTELLIGENCE PLATFORM</span>
          </h1>
        </div>
        <div className="init-line" />
        <h2>{error ? 'Ocean data service unavailable' : 'Initializing ocean digital twin'}</h2>
        {error ? (
          <>
            <p>{error}</p>
            <p>
              Start the Python service with <code>python run.py</code>, then reconnect.
            </p>
            <button onClick={() => (dataset ? setRevision((v) => v + 1) : void bootstrap())}>
              Reconnect to ocean service
            </button>
          </>
        ) : (
          <>
            <div className="init-steps">
              <span>
                MODEL GRID <b>{dataset ? 'READY' : 'READING'}</b>
              </span>
              <span>
                DEPTH LAYERS <b>{dataset ? `${dataset.depths.length} LEVELS` : 'PREPARING'}</b>
              </span>
              <span>
                CURRENT FIELD <b>PREPARING</b>
              </span>
              <span>
                OBSERVATION NETWORK{' '}
                <b>{observations.length ? `${observations.length} PROFILES` : 'READING'}</b>
              </span>
            </div>
            <div className="init-progress" />
          </>
        )}
        <small>SIH26067 · Ministry of Earth Sciences / INCOIS prototype</small>
      </div>
    );
  const displayVariable = frame.slice.variable,
    meta = dataset.variables.find((v) => v.id === displayVariable)!,
    displayRange =
      variable === displayVariable
        ? range
        : dataset.synthetic
          ? defaultRanges[displayVariable]
          : meta.range;
  const visibleSensors = observations.filter((o) =>
    o.instrument_type === 'ARGO' ? argo : gliders,
  );
  const ready = !busy && !error;
  const tourLabels = [
    'Explore the Indian Ocean surface',
    'Descend to 500 metres',
    'Reveal the complete water column',
    'Watch currents evolve through time',
    'Compare a sensor profile with the model',
  ];
  return (
    <main
      className={`app ${presentation ? 'presentation' : ''} ${collapsed ? 'controls-collapsed' : ''} ${selected ? 'has-selection' : ''}`}
    >
      <header className="topbar">
        <a className="brand" href="/" aria-label="OceanTwin home">
          <span className="brand-mark">
            <Waves size={26} />
          </span>
          <span>
            Ocean<span className="brand-light">Twin</span>
            <small>OCEAN INTELLIGENCE</small>
          </span>
        </a>
        <div className="topbar-divider" />
        <div className="workspace-name">
          Indian Ocean Digital Twin<small>INCOIS · SIH26067 RESEARCH PROTOTYPE</small>
        </div>
        <div className="topbar-actions">
          <span className="demo-badge">{dataset.synthetic ? 'DEMO DATA' : 'LOCAL DATA'}</span>
          <span className="system-status">
            <i className={ready ? '' : 'loading'} />
            {ready ? 'SYSTEM READY' : busy ? 'UPDATING MODEL' : 'SERVICE ALERT'}
          </span>
          <button className="presentation-button" onClick={() => setPresentation((v) => !v)}>
            {presentation ? <Shrink size={15} /> : <Expand size={15} />}
            <span>{presentation ? 'Exit presentation' : 'Present'}</span>
            <kbd>P</kbd>
          </button>
          <button className="icon-button" aria-label="Viewer help" onClick={() => setHelp(true)}>
            <CircleHelp size={17} />
          </button>
        </div>
      </header>
      <div className="viewer">
        <OceanScene
          dataset={dataset}
          frame={frame}
          land={land}
          variable={displayVariable}
          mode={mode}
          range={displayRange}
          opacity={opacity}
          exaggeration={exaggeration}
          grid={grid}
          currents={currents}
          density={density}
          observations={visibleSensors}
          selected={selected?.id ?? null}
          onSelect={select}
          onInspect={inspect}
          preset={preset}
          cameraKey={cameraKey}
          threshold={threshold}
        />
      </div>
      <div className="viewer-heading">
        <div className="viewer-kicker">
          <span className="tiny-dot" />{' '}
          {dataset.synthetic ? 'NORTHERN INDIAN OCEAN' : 'REGIONAL MODEL DOMAIN'}
        </div>
        <h1>
          {meta.name}
          <span>/ {modeNames[mode]}</span>
        </h1>
        <p>
          {dataset.synthetic ? 'Synthetic demonstration data' : 'Local NetCDF data'} <span>·</span>{' '}
          {dataset.grid.depth} depth levels <span>·</span> {dataset.times.length} timesteps
        </p>
      </div>
      {!presentation && !collapsed && (
        <Controls
          dataset={dataset}
          variable={variable}
          setVariable={chooseVariable}
          mode={mode}
          setMode={chooseMode}
          depth={depth}
          setDepth={setDepth}
          opacity={opacity}
          setOpacity={setOpacity}
          exaggeration={exaggeration}
          setExaggeration={setExaggeration}
          range={range}
          setRange={setRange}
          argo={argo}
          setArgo={setArgo}
          gliders={gliders}
          setGliders={setGliders}
          currents={currents}
          setCurrents={setCurrents}
          grid={grid}
          setGrid={setGrid}
          density={density}
          setDensity={setDensity}
          threshold={threshold}
          setThreshold={setThreshold}
          onUpload={() => fileInput.current?.click()}
          onDemo={() => void restore()}
          onCollapse={() => setCollapsed(true)}
          uploading={uploading}
        />
      )}
      {!presentation && collapsed && (
        <button className="expand-controls" onClick={() => setCollapsed(false)}>
          <SlidersHorizontal size={16} />
          <ChevronRight size={14} />
        </button>
      )}
      <input
        ref={fileInput}
        type="file"
        accept=".nc"
        hidden
        aria-label="Upload NetCDF"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
        }}
      />
      {(!presentation || selected || inspection) && (
        <Inspector
          dataset={dataset}
          field={frame.slice}
          observations={observations}
          selected={selected}
          onSelect={select}
          inspection={inspection}
          onClearInspection={() => setInspection(null)}
          compare={compare}
          setCompare={setCompare}
        />
      )}
      {presentation && (
        <div className="presentation-controls">
          <select
            aria-label="Presentation variable"
            value={variable}
            onChange={(e) => chooseVariable(e.target.value as Variable)}
          >
            {dataset.variables.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Presentation view"
            value={mode}
            onChange={(e) => chooseMode(e.target.value as Mode)}
          >
            <option value="slice">Depth slice</option>
            <option value="volume">3D volume</option>
            {dataset.has_currents && <option value="currents">Current field</option>}
            <option value="iso">Isosurface preview</option>
          </select>
          <label>
            DEPTH{' '}
            <input
              aria-label="Presentation depth"
              type="range"
              min={dataset.bounds.depth[0]}
              max={dataset.bounds.depth[1]}
              step={10}
              value={depth}
              onChange={(e) => setDepth(+e.target.value)}
            />
            <b>{depth} m</b>
          </label>
        </div>
      )}
      <div className="camera-controls">
        <span>
          <Compass size={15} />
        </span>
        {(['regional', 'surface', 'underwater'] as const).map((p) => (
          <button key={p} className={preset === p ? 'active' : ''} onClick={() => camera(p)}>
            {p}
          </button>
        ))}
        <button aria-label="Reset view" title="Reset view" onClick={() => camera('regional')}>
          <RotateCcw size={14} />
        </button>
      </div>
      <div className="depth-readout">
        <span>
          <ArrowDown size={13} />{' '}
          {mode === 'volume' || mode === 'iso' ? 'WATER COLUMN' : 'SELECTED DEPTH'}
        </span>
        <strong>
          {mode === 'volume' || mode === 'iso'
            ? `0–${dataset.bounds.depth[1].toLocaleString()}`
            : (frame.slice.depth ?? 0).toLocaleString()}
          <small>m</small>
        </strong>
        <p>
          VERTICAL DISPLAY {exaggeration}× <span>· SCHEMATIC</span>
        </p>
      </div>
      <div className="colorbar">
        <div>
          <span>{meta.name.toUpperCase()}</span>
          <small>{meta.units}</small>
        </div>
        <div className="colorbar-gradient" style={{ background: gradient(displayVariable) }} />
        <div className="colorbar-ticks">
          <span>{displayRange[0].toFixed(1)}</span>
          <span>{((displayRange[0] + displayRange[1]) / 2).toFixed(1)}</span>
          <span>{displayRange[1].toFixed(1)}</span>
        </div>
      </div>
      <div className="scene-hint">
        DRAG TO ORBIT <span>·</span> SCROLL TO ZOOM <span>·</span> CLICK TO INSPECT
      </div>
      <div className="scene-attribution">
        Natural Earth coastline ·{' '}
        {currents ? 'Current motion accelerated 250,000×' : 'Rectilinear regional projection'}
      </div>
      {busy && (
        <div className="update-toast">
          <span className="spinner" />
          Preparing model frame · previous frame shown
        </div>
      )}
      {error && (
        <div className="error-toast" role="alert">
          <span>{error}</span>
          <button
            onClick={() => {
              setError('');
              setRevision((v) => v + 1);
            }}
          >
            Retry
          </button>
          <button aria-label="Dismiss error" onClick={() => setError('')}>
            <X size={14} />
          </button>
        </div>
      )}
      {tour >= 0 && (
        <div className="tour-caption">
          <span>GUIDED EXPLORATION {tour + 1} / 5</span>
          <strong>{tourLabels[tour]}</strong>
          <button aria-label="Stop demo tour" onClick={() => setTour(-1)}>
            <X size={15} />
          </button>
        </div>
      )}
      <footer className="timeline">
        <div className="playback-buttons">
          <button
            aria-label="Previous timestep"
            onClick={() => {
              setPlaying(false);
              setTime((v) => (v - 1 + dataset.times.length) % dataset.times.length);
            }}
          >
            <SkipBack size={17} />
          </button>
          <button
            className="play-button"
            aria-label={playing ? 'Pause playback' : 'Play playback'}
            onClick={() => setPlaying((v) => !v)}
          >
            {playing ? (
              <Pause size={19} fill="currentColor" />
            ) : (
              <Play size={19} fill="currentColor" />
            )}
          </button>
          <button
            aria-label="Next timestep"
            onClick={() => {
              setPlaying(false);
              setTime((v) => (v + 1) % dataset.times.length);
            }}
          >
            <SkipForward size={17} />
          </button>
        </div>
        <div className="timeline-date">
          <span>MODEL VALID TIME</span>
          <strong>{stamp(frame.slice.timestamp)}</strong>
        </div>
        <div className="timeline-track">
          <div className="timeline-track-header">
            <span>TEMPORAL EXPLORER</span>
            <span>
              FRAME {String(frame.slice.time + 1).padStart(2, '0')} / {dataset.times.length}
            </span>
          </div>
          <input
            aria-label="Model time"
            type="range"
            min={0}
            max={dataset.times.length - 1}
            step={1}
            value={time}
            onChange={(e) => {
              setPlaying(false);
              setTime(+e.target.value);
            }}
          />
          <div className="timeline-labels">
            {[
              ...new Set([
                0,
                Math.floor((dataset.times.length - 1) / 3),
                Math.floor(((dataset.times.length - 1) * 2) / 3),
                dataset.times.length - 1,
              ]),
            ].map((i) => (
              <span key={i}>
                {new Date(dataset.times[i]).toLocaleString('en-GB', {
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZone: 'UTC',
                })}
              </span>
            ))}
          </div>
        </div>
        <button
          className={`tour-button ${tour >= 0 ? 'active' : ''}`}
          disabled={!dataset.synthetic}
          onClick={() => setTour((v) => (v >= 0 ? -1 : 0))}
        >
          {tour >= 0 ? <Pause size={15} /> : <Play size={15} />}
          <span>{tour >= 0 ? 'STOP TOUR' : 'DEMO TOUR'}</span>
        </button>
      </footer>
      {help && (
        <div className="modal-backdrop" onClick={() => setHelp(false)}>
          <section
            className="help-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="icon-button close-help"
              autoFocus
              aria-label="Close help"
              onClick={() => setHelp(false)}
            >
              <X size={18} />
            </button>
            <Waves size={30} />
            <h2 id="help-title">Explore below the surface.</h2>
            <p>Rotate the ocean, descend through the model, and inspect the observation network.</p>
            <dl>
              <div>
                <dt>Left drag / right drag</dt>
                <dd>Orbit / pan</dd>
              </div>
              <div>
                <dt>Scroll</dt>
                <dd>Zoom</dd>
              </div>
              <div>
                <dt>Click ocean slice</dt>
                <dd>Inspect local values</dd>
              </div>
              <div>
                <dt>
                  <Radio size={13} /> Click a sensor
                </dt>
                <dd>Open a depth profile</dd>
              </div>
              <div>
                <dt>P / Space / Esc</dt>
                <dd>Present / play / exit</dd>
              </div>
            </dl>
            <p className="method-note">
              Depth is schematically exaggerated for visibility. Currents follow model u/v vectors
              with accelerated motion. The demo model and all instrument profiles are synthetic; no
              live INCOIS connection is implied.
            </p>
            <button className="primary-button" onClick={() => setHelp(false)}>
              Return to ocean
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
