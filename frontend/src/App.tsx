import { useCallback, useEffect, useRef, useState } from 'react';
import { Maximize, Minimize, X, CircleHelp, Search, Waves } from 'lucide-react';
import type {
  CameraPreset,
  Dataset,
  Frame,
  Inspection,
  Mode,
  Observation,
  Variable,
} from './types';
import { api, request, validateDataset, validateField } from './services/api';
import GlobeExplorer from './explorer/GlobeExplorer';
import { Inspector } from './components/Inspector';
import { ToolRail } from './components/ToolRail';
import { RightPanel } from './components/RightPanel';
import { BottomTimeline } from './components/BottomTimeline';
import type { ExplorerSeed } from './experience/experienceState';
import { useModelContext } from './services/useModelContext';

const defaultRanges: Record<Variable, [number, number]> = {
  temperature: [2, 31],
  salinity: [33, 37],
  chlorophyll: [0, 2],
  current_speed: [0, 1],
};

export default function App({
  initialVariable = 'temperature',
  initialDepth = 0,
  initialTime = 0,
  handoffSeed = null,
  active = true,
}: {
  initialVariable?: Variable;
  initialDepth?: number;
  initialTime?: number;
  handoffSeed?: ExplorerSeed | null;
  active?: boolean;
} = {}) {
  // ── Data state ──────────────────────────────────────────────────────
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [variable, setVariable] = useState<Variable>('temperature');
  const [mode, setMode] = useState<Mode>('slice');
  const [depth, setDepth] = useState(0);
  const [time, setTime] = useState(0);
  const [opacity, setOpacity] = useState(0.85);
  const [exaggeration, setExaggeration] = useState(5);
  const [range, setRange] = useState<[number, number]>([2, 31]);
  const [threshold, setThreshold] = useState(20);
  const [argo, setArgo] = useState(true);
  const [gliders, setGliders] = useState(true);
  const [currents, setCurrents] = useState(true);
  const [grid, setGrid] = useState(false);
  const [density, setDensity] = useState(1200);
  const [frame, setFrame] = useState<Frame | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<Observation | null>(null);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [compare, setCompare] = useState(false);

  // ── UI state ─────────────────────────────────────────────────────────
  const [help, setHelp] = useState(false);
  const [tour, setTour] = useState(-1);
  const [baseName, setBaseName] = useState('');
  const [preset, setPreset] = useState<CameraPreset>('global');
  const [cameraKey, setCameraKey] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [isFull, setIsFull] = useState(false);
  const [presentation, setPresentation] = useState(false);

  // ── Refs ─────────────────────────────────────────────────────────────
  const fileInput = useRef<HTMLInputElement>(null);
  const volumeCache = useRef(new Map<string, import('./types').Field>());
  const inspectionRequest = useRef<AbortController | null>(null);
  const bootstrapId = useRef(0);
  const frameRef = useRef<Frame | null>(null);
  const volumeKeyRef = useRef('');
  const handoffKey = useRef('');

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

  // ── Bootstrap ─────────────────────────────────────────────────────────
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
      const v0 = d.variables.some((v) => v.id === initialVariable)
        ? initialVariable
        : d.variables[0].id;
      setVariable(v0);
      setRange(d.synthetic ? defaultRanges[v0] : d.variables.find((m) => m.id === v0)!.range);
      setThreshold(v0 === 'temperature' ? 20 : (defaultRanges[v0][0] + defaultRanges[v0][1]) / 2);
      setDepth(d.depths.includes(initialDepth) ? initialDepth : d.depths[0]);
      setTime(initialTime >= 0 && initialTime < d.times.length ? initialTime : 0);
      frameRef.current = null;
      volumeKeyRef.current = '';
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
  }, [initialDepth, initialTime, initialVariable]);

  useEffect(() => {
    void bootstrap();
    return () => {
      bootstrapId.current++;
    };
  }, [bootstrap]);

  // ── Frame fetch ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!dataset) return;
    inspectionRequest.current?.abort();
    const controller = new AbortController();
    setBusy(true);
    setError('');
    const delay = window.setTimeout(async () => {
      try {
        const volumeKey = `${revision}-${variable}-${time}`;
        const volumeReady = frameRef.current && volumeKeyRef.current === volumeKey;
        const [slice, volume, current] = await Promise.all([
          api.field(variable, time, depth, controller.signal),
          volumeReady
            ? Promise.resolve(frameRef.current!.volume)
            : volumeCache.current.has(volumeKey)
              ? Promise.resolve(volumeCache.current.get(volumeKey)!)
              : api.field(variable, time, null, controller.signal),
          dataset.has_currents
            ? api.currents(time, depth, controller.signal)
            : Promise.resolve(null),
        ]);
        if (controller.signal.aborted) return;
        validateField(slice);
        if (!volumeReady) {
          validateField(volume);
          volumeCache.current.set(volumeKey, volume);
          if (volumeCache.current.size > 24)
            volumeCache.current.delete(volumeCache.current.keys().next().value!);
        }
        if (
          current &&
          (!current.u?.length ||
            !current.v?.length ||
            current.latitudes.length < 2 ||
            current.longitudes.length < 2)
        )
          throw new Error('The current field is incomplete.');
        volumeKeyRef.current = volumeKey;
        const next = { slice, volume, currents: current };
        frameRef.current = next;
        setFrame(next);
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

  // ── Playback ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!playing || busy || !dataset) return;
    const t = window.setTimeout(() => setTime((v) => (v + 1) % dataset.times.length), 1250);
    return () => window.clearTimeout(t);
  }, [playing, busy, dataset, time]);

  // ── Fullscreen ────────────────────────────────────────────────────────
  useEffect(() => {
    const onFull = () => setIsFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFull);
    return () => document.removeEventListener('fullscreenchange', onFull);
  }, []);
  function toggleFull() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => {});
  }

  // ── Keyboard shortcuts ────────────────────────────────────────────────
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

  // ── Helpers ───────────────────────────────────────────────────────────
  const select = (obs: Observation | null) => {
    inspectionRequest.current?.abort();
    setSelected(obs);
    setInspection(null);
  };

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

  // Stub analysis handlers — these open the inspector or start a mode.
  function openTransect() {
    chooseMode('currents'); // switch to a mode that enables clicking
  }
  function openRegionStats() {
    setHelp(false);
  }
  function openProfile() {
    // Profile probe: user clicks the ocean; handled by onInspect already.
    chooseMode('slice');
  }

  // ── Tour ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (tour < 0 || !dataset) return;
    setPlaying(false);
    switch (tour) {
      case 0:
        chooseVariable('temperature');
        setDepth(0);
        setMode('slice');
        setTime(0);
        camera('global');
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


  // ── Landing handoff ───────────────────────────────────────────────────
  useEffect(() => {
    if (!handoffSeed || !dataset) return;
    const key = `${handoffSeed.variable}|${handoffSeed.depth}|${handoffSeed.time}`;
    if (handoffKey.current === key) return;
    handoffKey.current = key;
    if (handoffSeed.variable !== variable) chooseVariable(handoffSeed.variable);
    if (handoffSeed.depth !== depth && dataset.depths.includes(handoffSeed.depth))
      setDepth(handoffSeed.depth);
    if (
      handoffSeed.time !== time &&
      handoffSeed.time >= 0 &&
      handoffSeed.time < dataset.times.length
    )
      setTime(handoffSeed.time);
  }, [handoffSeed, dataset, variable, depth, time]);

  // ── Initialization screen ─────────────────────────────────────────────
  if (!dataset || !frame) {
    return (
      <div className="init-screen">
        <div className="init-brand">
          <span className="init-brand-word">
            OCEAN<span>TWIN</span>
          </span>
          <p>OCEAN INTELLIGENCE PLATFORM</p>
        </div>
        <div className="init-line" />
        <h2>{error ? 'Ocean data service unavailable' : 'Initializing ocean digital twin'}</h2>
        {error ? (
          <>
            <p className="init-error">{error}</p>
            <p className="init-hint">
              Start the Python service with <code>python run.py</code>, then reconnect.
            </p>
            <button
              className="init-reconnect"
              onClick={() => (dataset ? setRevision((v) => v + 1) : void bootstrap())}
            >
              Reconnect to ocean service
            </button>
          </>
        ) : (
          <div className="init-progress-wrap">
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
            <div className="init-bar" />
          </div>
        )}
        <small className="init-footer">OceanTwin · Demo model · Synthetic profiles</small>
      </div>
    );
  }

  // ── Derived values ────────────────────────────────────────────────────
  const displayVariable = frame.slice.variable;
  const meta = dataset.variables.find((v) => v.id === displayVariable)!;
  const displayRange: [number, number] =
    variable === displayVariable
      ? range
      : dataset.synthetic
        ? defaultRanges[displayVariable]
        : meta.range;
  const visibleSensors = observations.filter((o) =>
    o.instrument_type === 'ARGO' ? argo : gliders,
  );

  const tourLabels = [
    dataset.global ? 'Explore all ocean basins at the surface' : 'Explore the ocean surface',
    'Descend to 500 metres depth',
    'Reveal the complete 3D water column',
    'Watch currents evolve through time',
    'Compare a sensor profile with the model',
  ];

  // ── Main render ───────────────────────────────────────────────────────
  return (
    <main className={`app ${presentation ? 'presentation' : ''}`}>
      {/* ── Navbar ──────────────────────────────────────────────────── */}
      <header className="topbar">
        <a className="brand" href="/" aria-label="OceanTwin home">
          <span className="brand-word">
            OCEAN<span>TWIN</span>
          </span>
        </a>
        <nav className="topnav" aria-label="Explorer views">
          <button onClick={() => camera('global')}>EXPLORE</button>
          <button
            onClick={() => {
              setArgo(true);
              setGliders(true);
              select(null);
            }}
          >
            OBSERVATIONS
          </button>
          <button onClick={() => chooseMode('volume')}>MODELS</button>
          <button onClick={() => fileInput.current?.click()}>DATA</button>
        </nav>
        <div className="topbar-right">
          <span className="sys-status">
            <i className={busy ? 'loading' : ''} />
            {busy ? 'Updating' : 'System Ready'}
          </span>
          <span className="demo-badge">{dataset.synthetic ? 'DEMO DATA' : 'LOCAL DATA'}</span>
          <button
            className="icon-button"
            aria-label={isFull ? 'Exit fullscreen' : 'Enter fullscreen'}
            onClick={toggleFull}
          >
            {isFull ? <Minimize size={16} /> : <Maximize size={16} />}
          </button>
          <button className="icon-button" aria-label="Help" onClick={() => setHelp(true)}>
            <CircleHelp size={16} />
          </button>
        </div>
      </header>

      {/* ── Cesium globe (fills everything between navbar and timeline) ── */}
      <div className="viewer">
        <GlobeExplorer
          enabled={active}
          dataset={dataset}
          frame={frame}
          variable={displayVariable}
          mode={mode}
          range={displayRange}
          opacity={opacity}
          exaggeration={exaggeration}
          grid={grid}
          currents={currents}
          observations={visibleSensors}
          density={density}
          selected={selected?.id ?? null}
          onSelect={select}
          onInspect={inspect}
          preset={preset}
          cameraKey={cameraKey}
          threshold={threshold}
          onBaseLayer={setBaseName}
        />
      </div>

      {/* ── Floating hero text (top-left of globe area) ──────────────── */}
      {!presentation && (
        <div className="viewer-hero">
          <h1 className="viewer-title">
            Earth&apos;s Ocean, <span className="viewer-title-accent">in Depth</span>
          </h1>
          <p className="viewer-subtitle">
            Explore, analyze and understand the ocean
            <br />
            through a unified 3D digital twin.
          </p>
        </div>
      )}

      {/* ── Search bar (top-right of globe, decorative) ──────────────── */}
      {!presentation && (
        <div className="search-bar-wrap">
          <Search size={13} className="search-icon" />
          <input
            type="text"
            className="search-bar"
            placeholder="Search location..."
            aria-label="Search location"
            readOnly
            title="Geographic search not yet implemented"
          />
        </div>
      )}

      {/* ── Left tool rail ────────────────────────────────────────────── */}
      {!presentation && (
        <ToolRail
          dataset={dataset}
          preset={preset}
          onCamera={camera}
          variable={variable}
          onVariable={chooseVariable}
          mode={mode}
          onMode={chooseMode}
          depth={depth}
          onDepth={setDepth}
          opacity={opacity}
          onOpacity={setOpacity}
          exaggeration={exaggeration}
          onExaggeration={setExaggeration}
          argo={argo}
          onArgo={setArgo}
          gliders={gliders}
          onGliders={setGliders}
          currents={currents}
          onCurrents={setCurrents}
          grid={grid}
          onGrid={setGrid}
          density={density}
          onDensity={setDensity}
          range={range}
          onRange={setRange}
          threshold={threshold}
          onThreshold={setThreshold}
          onUpload={() => fileInput.current?.click()}
          onDemo={() => void restore()}
          uploading={uploading}
          onTransect={openTransect}
          onRegionStats={openRegionStats}
          onProfile={openProfile}
        />
      )}

      {/* ── Right panel ───────────────────────────────────────────────── */}
      {!presentation && (
        <RightPanel
          dataset={dataset}
          frame={frame}
          variable={variable}
          onVariable={chooseVariable}
          mode={mode}
          onMode={chooseMode}
          range={displayRange}
          depth={depth}
          onDepth={setDepth}
          observations={observations}
          argo={argo}
          gliders={gliders}
          busy={busy}
          baseName={baseName}
        />
      )}

      {/* ── Observation / point inspector (floating) ───────────────────── */}
      {(selected || inspection) && (
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

      {/* ── Presentation mode overlay controls ────────────────────────── */}
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
          <button onClick={() => setPresentation(false)}>Exit</button>
        </div>
      )}

      {/* ── Present shortcut ─────────────────────────────────────────── */}
      {!presentation && (
        <button
          className="present-shortcut"
          onClick={() => setPresentation(true)}
          aria-label="Enter presentation mode"
        >
          Present <kbd>P</kbd>
        </button>
      )}

      {/* ── Scene attribution ─────────────────────────────────────────── */}
      <div className="scene-attribution">
        Cesium · WGS84{baseName ? ` · ${baseName}` : ''}
        {currents ? ' · Streamlines follow model u/v' : ''}
      </div>

      {/* ── Hidden file input ─────────────────────────────────────────── */}
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

      {/* ── Toast notifications ───────────────────────────────────────── */}
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

      {/* ── Tour caption ─────────────────────────────────────────────── */}
      {tour >= 0 && (
        <div className="tour-caption">
          <span>GUIDED EXPLORATION {tour + 1} / 5</span>
          <strong>{tourLabels[tour]}</strong>
          <button aria-label="Stop demo tour" onClick={() => setTour(-1)}>
            <X size={15} />
          </button>
        </div>
      )}

      {/* ── Bottom timeline ───────────────────────────────────────────── */}
      <BottomTimeline
        dataset={dataset}
        frame={frame}
        time={time}
        onTime={(t) => {
          setPlaying(false);
          setTime(t);
        }}
        playing={playing}
        onPlay={() => setPlaying((v) => !v)}
        onTour={() => setTour((v) => (v >= 0 ? -1 : 0))}
        tourActive={tour >= 0}
        hasSynthetic={dataset.synthetic}
      />

      {/* ── Help modal ────────────────────────────────────────────────── */}
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
                <dt>Left drag</dt>
                <dd>Orbit / rotate Earth</dd>
              </div>
              <div>
                <dt>Scroll</dt>
                <dd>Zoom toward / away</dd>
              </div>
              <div>
                <dt>Click ocean</dt>
                <dd>Inspect local values</dd>
              </div>
              <div>
                <dt>Click sensor</dt>
                <dd>Open depth profile</dd>
              </div>
              <div>
                <dt>P / Space / Esc</dt>
                <dd>Present / play / exit</dd>
              </div>
            </dl>
            <p className="method-note">
              Depth is schematically exaggerated for visibility. Currents follow model u/v vectors.
              The demo model and all instrument profiles are synthetic.
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
