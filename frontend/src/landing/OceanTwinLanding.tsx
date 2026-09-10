import { useCallback, useEffect, useRef, useState } from 'react';
import CesiumGlobe from '../cesium/CesiumGlobe';
import { getCesium, type CesiumViewer } from '../cesium/cesiumTypes';
import {
  applyAnalysisImagery,
  applyBathymetry,
  applyCinematicBase,
  removeAnalysisImagery,
  restoreEllipsoidTerrain,
  tuneTilesetDetail,
  type CinematicBase,
} from '../cesium/CesiumLayers';
import {
  clearObservationEntities,
  syncObservationEntities,
  type LandingObservation,
} from '../cesium/CesiumObservations';
import {
  LandingCameraController,
  diveDepthForProgress,
  sceneForProgress,
} from './LandingCameraController';
import { LANDING_SCENES, SCENE_INDEX } from './LandingScenes';
import LandingHUD from './LandingHUD';
import LandingTelemetry, { type Telemetry } from './LandingTelemetry';
import LandingProgress from './LandingProgress';
import { readEnv, type ExplorerSeed, type LandingScene } from '../experience/experienceState';
import { api, validateDataset } from '../services/api';
import type { Comparison, Dataset } from '../types';
import './landing.css';

interface Props {
  onEnterExplorer: (seed: ExplorerSeed) => void;
}

const FALLBACK_DEPTHS = [0, 50, 100, 250, 500, 1000, 2000];
// Scroll-to-progress anchors for the progress rail dots.
const SCENE_ANCHOR: Record<LandingScene, number> = {
  ocean: 0.05,
  depth: 0.35,
  time: 0.62,
  observations: 0.8,
  explorer: 1,
};

// Cinematic entry: ONE sticky stage, ONE short scroll track, ONE progress
// value, ONE rAF loop writing the camera. Scrolling is the sole driver;
// the loop smooths and interpolates, React only rerenders on HUD changes.
export default function OceanTwinLanding({ onEnterExplorer }: Props) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [failure, setFailure] = useState('');
  const [scene, setScene] = useState<LandingScene>('ocean');
  const [progress, setProgress] = useState(0);
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [observations, setObservations] = useState<LandingObservation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [diveDepth, setDiveDepth] = useState(0);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [compareState, setCompareState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [base, setBase] = useState<CinematicBase>('none');

  const viewerRef = useRef<CesiumViewer | null>(null);
  const cameraRef = useRef<LandingCameraController | null>(null);
  const token = useRef(readEnv('VITE_CESIUM_ION_TOKEN'));
  if (!cameraRef.current) {
    cameraRef.current = new LandingCameraController();
    cameraRef.current.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  // Rapidly changing cinematic values live in refs; React state updates
  // only when the HUD visibly changes (scene, depth level, progress bar).
  const targetRef = useRef(0);
  const smoothRef = useRef(0);
  const sceneRef = useRef<LandingScene>('ocean');
  const diveRef = useRef(0);
  const barRef = useRef(0);
  const depthsRef = useRef<number[]>(FALLBACK_DEPTHS);

  const depths = dataset?.depths.length ? dataset.depths : FALLBACK_DEPTHS;
  depthsRef.current = depths;
  const activeDef = LANDING_SCENES[SCENE_INDEX[scene]];
  const selected = observations.find((o) => o.id === selectedId) ?? null;

  // Light metadata bootstrap: dataset ranges, depths, times and the
  // observation network. No field volumes are loaded during the landing.
  useEffect(() => {
    let cancelled = false;
    Promise.all([api.datasets(), api.observations()])
      .then(([sets, obs]) => {
        if (cancelled) return;
        const d = validateDataset(sets[0]);
        setDataset(d);
        setObservations(
          obs.map((o) => ({
            id: o.id,
            instrument_type: o.instrument_type,
            latitude: o.latitude,
            longitude: o.longitude,
            max_depth: o.max_depth,
            timestamp: o.timestamp,
          })),
        );
        setSelectedId(obs.find((o) => o.instrument_type === 'ARGO')?.id ?? obs[0]?.id ?? null);
        if (d.depths.length) {
          depthsRef.current = d.depths;
          diveRef.current = d.depths[0];
          setDiveDepth(d.depths[0]);
        }
      })
      .catch(() => {
        // Narrative still runs without live metadata; the comparison scene
        // falls back to its neutral placeholder and the explorer retries.
        if (!cancelled) setDataset(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleViewer = useCallback((viewer: CesiumViewer | null) => {
    viewerRef.current = viewer;
    if (!viewer) return;
    cameraRef.current?.attach(viewer);
    setStatus('ready');
    void applyCinematicBase(viewer, token.current).then((b) => setBase(b));
  }, []);

  const handleFailure = useCallback((message: string) => {
    setFailure(message);
    setStatus('failed');
  }, []);

  useEffect(
    () => () => {
      const viewer = viewerRef.current;
      if (viewer) {
        try {
          clearObservationEntities(viewer);
        } catch {
          /* Teardown is best-effort. */
        }
      }
      cameraRef.current?.attach(null);
    },
    [],
  );

  // Handoff seed: narrative variable/depth plus the dataset timestep
  // matching the highlighted observation, so the explorer opens aligned.
  const enter = useCallback(() => {
    let time = 0;
    if (dataset && selected) {
      const target = Date.parse(selected.timestamp);
      if (Number.isFinite(target)) {
        const idx = dataset.times.findIndex((t) => Date.parse(t) === target);
        if (idx >= 0) time = idx;
      }
    }
    const list = depthsRef.current;
    const depth = list.includes(diveRef.current) ? diveRef.current : (list[0] ?? 0);
    onEnterExplorer({ variable: 'temperature', depth, time });
  }, [dataset, selected, onEnterExplorer]);

  // Scroll input only writes the target ref — never setState, never camera.
  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      targetRef.current = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // The single cinematic loop: damp toward the target, write one direct
  // camera view per frame, and publish discrete HUD changes. Stopping the
  // scroll settles the camera; reversing reverses everything.
  useEffect(() => {
    if (status !== 'ready') return;
    let raf = 0;
    let last = performance.now();
    const reduced = cameraRef.current?.reducedMotion ?? false;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const target = targetRef.current;
      const factor = reduced ? 1 : 1 - Math.exp(-dt * 5);
      const next = smoothRef.current + (target - smoothRef.current) * factor;
      smoothRef.current = Math.abs(next - target) < 1e-5 ? target : next;
      const p = smoothRef.current;

      cameraRef.current?.applyProgress(p);

      const s = sceneForProgress(p);
      if (s !== sceneRef.current) {
        sceneRef.current = s;
        setScene(s);
      }
      const d = diveDepthForProgress(p, depthsRef.current);
      if (d !== diveRef.current) {
        diveRef.current = d;
        setDiveDepth(d);
      }
      if (Math.abs(p - barRef.current) > 0.002) {
        barRef.current = p;
        setProgress(p);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [status]);

  // Scene side-effects: exactly one layer change per scene, LOD matched to
  // the commanded distance. Scrolling back reverses the same path.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (status !== 'ready' || !viewer) return;
    let cancelled = false;
    if (cameraRef.current) tuneTilesetDetail(cameraRef.current.heightForScene(scene));

    const order = SCENE_INDEX[scene];
    const showObs = order >= SCENE_INDEX.observations && order <= SCENE_INDEX.observations;
    syncObservationEntities(viewer, observations, {
      visible: showObs,
      selectedId: showObs ? selectedId : null,
    });

    if (scene === 'depth') {
      void applyBathymetry(viewer, token.current).then((ok) => {
        if (!ok && !cancelled) restoreEllipsoidTerrain(viewer);
      });
    } else {
      restoreEllipsoidTerrain(viewer);
    }
    if (scene === 'time' && base === 'osm') {
      void applyAnalysisImagery(viewer, token.current);
    } else {
      removeAnalysisImagery(viewer);
    }
    return () => {
      cancelled = true;
    };
  }, [scene, status, observations, selectedId, base]);

  // Scientific climax uses the real comparison endpoint against the
  // dataset step nearest the observation timestamp. Failures resolve to
  // the neutral COMPARISON READY placeholder — never invented numbers.
  useEffect(() => {
    if (scene !== 'observations' || !selected || comparison || compareState !== 'idle') return;
    const controller = new AbortController();
    setCompareState('loading');
    let time = 0;
    const target = Date.parse(selected.timestamp);
    if (dataset && Number.isFinite(target)) {
      let best = Number.POSITIVE_INFINITY;
      dataset.times.forEach((t, i) => {
        const gap = Math.abs(Date.parse(t) - target);
        if (gap < best) {
          best = gap;
          time = i;
        }
      });
    }
    api
      .compare(selected.id, 'temperature', time, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setComparison(result);
          setCompareState('idle');
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setCompareState('error');
      });
    return () => controller.abort();
  }, [scene, selected, dataset, comparison, compareState]);

  // Instrument telemetry sampled from the cinematic camera; state only
  // updates when a rounded readout actually changes.
  const telemetryRef = useRef<Telemetry | null>(null);
  useEffect(() => {
    if (status !== 'ready') return;
    const id = window.setInterval(() => {
      const viewer = viewerRef.current;
      const Cesium = getCesium();
      if (!viewer || !Cesium) return;
      try {
        const p = viewer.camera.positionCartographic;
        const next: Telemetry = {
          latitude: Math.round(Cesium.Math.toDegrees(p.latitude) * 100) / 100,
          longitude: Math.round(Cesium.Math.toDegrees(p.longitude) * 100) / 100,
          altitude: Math.round(Math.max(0, p.height)),
        };
        const prev = telemetryRef.current;
        if (
          !prev ||
          prev.latitude !== next.latitude ||
          prev.longitude !== next.longitude ||
          prev.altitude !== next.altitude
        ) {
          telemetryRef.current = next;
          setTelemetry(next);
        }
      } catch {
        /* A missed sample is harmless. */
      }
    }, 400);
    return () => window.clearInterval(id);
  }, [status]);

  const jump = useCallback((target: LandingScene) => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({ top: SCENE_ANCHOR[target] * Math.max(0, max), behavior: 'auto' });
  }, []);

  const tint =
    scene === 'depth'
      ? 0.22 + (0.2 * Math.max(0, depths.indexOf(diveDepth))) / Math.max(1, depths.length - 1)
      : activeDef.tint;

  return (
    <div className="landing">
      <div className="cinematic-stage">
        <div className="landing-viewport">
          <CesiumGlobe onViewer={handleViewer} onFailure={handleFailure} />
          <div className="landing-tint" style={{ opacity: tint }} />
          {status === 'loading' && (
            <div className="landing-boot" role="status">
              <span>OCEANTWIN</span>
              <small>INITIALIZING EARTH OBSERVATION SYSTEM · LOADING GLOBAL SCENE</small>
            </div>
          )}
        </div>

        <header className="landing-top">
          <span className="landing-brand">
            OCEAN<span>TWIN</span>
          </span>
          <button className="landing-skip" onClick={enter}>
            SKIP INTRO <span aria-hidden="true">→</span>
          </button>
        </header>

        {status === 'ready' && (
          <>
            <LandingHUD
              scene={scene}
              def={activeDef}
              dataset={dataset}
              observationCount={observations.length}
              selected={selected}
              diveDepth={diveDepth}
              comparison={comparison}
              compareState={compareState}
            />
            <LandingTelemetry value={telemetry} />
            <LandingProgress active={scene} progress={progress} onJump={jump} />
            {scene === 'explorer' ? (
              <button className="landing-cta-final" onClick={enter}>
                ENTER OCEAN EXPLORER <span aria-hidden="true">→</span>
              </button>
            ) : (
              <div className="landing-hint" aria-hidden="true">
                SCROLL TO EXPLORE <span>↓</span>
              </div>
            )}
          </>
        )}

        {status === 'failed' && (
          <div className="landing-fallback" role="alert">
            <span>CINEMATIC VIEW UNAVAILABLE</span>
            <p>
              {failure || 'The 3D engine could not start.'} The scientific explorer is unaffected.
            </p>
            <button className="landing-enter" onClick={enter}>
              ENTER EXPLORER <span aria-hidden="true">→</span>
            </button>
          </div>
        )}
      </div>

      <div className="cinematic-scroll-space" aria-hidden="true" />
    </div>
  );
}
