import { useEffect, useRef, useState } from 'react';
import { Color } from 'three';
import { getCesium, type CesiumViewer } from '../cesium/cesiumTypes';
import { loadCesium } from '../cesium/loadCesium';
import { applyBathymetry } from '../cesium/CesiumLayers';
import { syncObservationEntities } from '../cesium/CesiumObservations';
import { readEnv } from '../experience/experienceState';
import { dataColor } from '../ocean/colors';
import { paintContinuousField, paintGlobalOcean } from '../cesium/ScientificField';
import { sample } from '../ocean/CurrentParticles';
import type { CameraPreset, Dataset, Frame, Mode, Observation, Variable } from '../types';

interface Props {
  enabled: boolean;
  dataset: Dataset;
  frame: Frame;
  variable: Variable;
  mode: Mode;
  range: [number, number];
  opacity: number;
  exaggeration: number;
  grid: boolean;
  currents: boolean;
  observations: Observation[];
  density: number;
  selected: string | null;
  onSelect: (o: Observation | null) => void;
  onInspect: (lat: number, lon: number) => void;
  preset: CameraPreset;
  cameraKey: number;
  threshold: number;
  onBaseLayer?: (name: string) => void;
}

import {
  GLOBAL_KM,
  REGIONAL_KM,
  ION_SATELLITE_2D,
  ION_WORLD_IMAGERY_FALLBACK,
  depthHeight,
  diveCameraHeight,
  domainExtents,
  OCEAN_PRESETS,
} from '../cesium/GeographicCoordinates';

export default function GlobeExplorer(props: Props) {
  const { enabled } = props;
  const host = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<CesiumViewer | null>(null);
  const layers = useRef<{
    oceanImagery: unknown;
    slice: unknown;
    outline: unknown;
    volumeSlices: unknown[];
    points: import('../cesium/cesiumTypes').CesiumPointCollection | null;
    lines: import('../cesium/cesiumTypes').CesiumLineCollection | null;
    currentPts: import('../cesium/cesiumTypes').CesiumPointCollection | null;
    grid: import('../cesium/cesiumTypes').CesiumLineCollection | null;
    obs: import('../cesium/cesiumTypes').CesiumDataSourceHandle | null;
    handler: import('../cesium/cesiumTypes').CesiumInputHandler | null;
    moveEndCleanup: (() => void) | null;
    changedCleanup: (() => void) | null;
    currentAnim: number | null;
    guides: string[];
  }>({
    oceanImagery: null,
    slice: null,
    outline: null,
    volumeSlices: [],
    points: null,
    lines: null,
    currentPts: null,
    grid: null,
    obs: null,
    handler: null,
    moveEndCleanup: null,
    changedCleanup: null,
    currentAnim: null,
    guides: [],
  });
  const live = useRef(props);
  live.current = props;
  const [failed, setFailed] = useState('');
  const [globeReady, setGlobeReady] = useState(false);
  // Camera altitude drives visualization level.
  const [camHeight, setCamHeight] = useState(Number.POSITIVE_INFINITY);

  // Domain-aware LOD: the renderer adapts to ANY dataset domain.
  // Global datasets (>180° span) show layers from farther away than regional.
  const domainWidth = Math.abs(
    props.dataset.bounds.longitude[1] - props.dataset.bounds.longitude[0],
  );
  const isGlobalScale = domainWidth >= 120;
  // Domain outline: shown only for regional datasets at mid-zoom.
  // Global datasets never show a domain outline (the whole ocean is the domain).
  const showOutline = !isGlobalScale && camHeight < GLOBAL_KM && camHeight >= REGIONAL_KM;

  // Viewer lifecycle: created once, never recreated for data changes.
  useEffect(() => {
    if (!enabled || !host.current || viewerRef.current) return;
    let cancelled = false;
    let viewer: CesiumViewer | null = null;
    void loadCesium()
      .then(async () => {
        if (cancelled || !host.current) return;
        const Cesium = getCesium();
        if (!Cesium) throw new Error('Cesium failed to initialize.');
        viewer = new Cesium.Viewer(host.current, {
          animation: false,
          timeline: false,
          baseLayerPicker: false,
          geocoder: false,
          homeButton: false,
          sceneModePicker: false,
          navigationHelpButton: false,
          fullscreenButton: false,
          selectionIndicator: false,
          infoBox: false,
          shouldAnimate: true,
          showRenderLoopErrors: false,
        });
        try {
          viewer.scene.renderError.addEventListener((error: unknown) => {
            if (!cancelled)
              setFailed(error instanceof Error ? error.message : 'Geographic rendering failed.');
          });
        } catch {
          /* Render loop keeps the engine default error panel. */
        }

        // ── Earth imagery: three-tier strategy ──────────────────────────
        const token = readEnv('VITE_CESIUM_ION_TOKEN');
        if (token) {
          try {
            Cesium.Ion.defaultAccessToken = token;
          } catch {
            /* Token assignment is best-effort. */
          }
        }

        let baseType: 'satellite' | 'osm' | 'offline' = 'offline';

        try {
          viewer.imageryLayers.removeAll(false);
        } catch {
          /* Keep engine default on failure. */
        }

        // Tier 1 — Satellite imagery
        if (token && Cesium.IonImageryProvider?.fromAssetId) {
          let attached = false;
          for (const assetId of [ION_SATELLITE_2D, ION_WORLD_IMAGERY_FALLBACK]) {
            try {
              const provider = await Cesium.IonImageryProvider.fromAssetId(assetId);
              if (cancelled) return;
              viewer.imageryLayers.addImageryProvider(provider);
              gradeBaseLayer(viewer, 'satellite');
              baseType = 'satellite';
              attached = true;
              break;
            } catch {
              /* Try next. */
            }
          }
          if (!attached) { /* Fall through to Tier 2. */ }
        }

        // Tier 2 — OpenStreetMap
        if (baseType === 'offline' && Cesium.UrlTemplateImageryProvider) {
          try {
            const osm = new Cesium.UrlTemplateImageryProvider({
              url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
              minimumLevel: 0,
              maximumLevel: 18,
            });
            if (!cancelled) {
              viewer.imageryLayers.addImageryProvider(osm);
              gradeBaseLayer(viewer, 'osm');
              baseType = 'osm';
            }
          } catch {
            /* Fall through to Tier 3. */
          }
        }

        // Tier 3 — Enhanced offline Earth (4K equirectangular canvas)
        if (baseType === 'offline' && Cesium.SingleTileImageryProvider) {
          try {
            const land = await buildEnhancedEarth(Cesium);
            if (cancelled) return;
            if (land) {
              viewer.imageryLayers.addImageryProvider(land);
            }
          } catch {
            /* Offline Earth failed — plain colored globe still shows. */
          }
        }

        live.current.onBaseLayer?.(
          baseType === 'satellite' ? 'satellite' : baseType === 'osm' ? 'OSM' : 'Natural Earth',
        );

        // ── Globe cosmetics ───────────────────────────────────────────────
        try {
          // Deep ocean blue — visible where imagery hasn't loaded.
          viewer.scene.globe.baseColor = new Cesium.Color(0.04, 0.14, 0.28, 1);
          viewer.scene.globe.enableLighting = true;
          if (Cesium.JulianDate) {
            viewer.clock.currentTime = Cesium.JulianDate.fromIso8601('2026-01-15T06:00:00Z');
          }
          viewer.scene.skyAtmosphere.show = true;
        } catch {
          /* Cosmetic only. */
        }

        // Free dive: camera can go underwater.
        try {
          viewer.scene.screenSpaceCameraController.enableCollisionDetection = false;
        } catch {
          /* Manual dives stay above the surface. */
        }

        // Camera altitude tracking — drives LOD decisions.
        try {
          const updateHeight = () => {
            try {
              const h = viewer!.camera.positionCartographic.height;
              if (Number.isFinite(h)) setCamHeight(h);
            } catch {
              /* A missed sample is harmless. */
            }
          };
          let last = 0;
          const onChanged = () => {
            const now = performance.now();
            if (now - last < 150) return;
            last = now;
            updateHeight();
          };
          viewer.camera.moveEnd.addEventListener(updateHeight);
          updateHeight();
          try {
            const cam = viewer.camera as unknown as {
              changed?: {
                addEventListener(l: () => void): void;
                removeEventListener(l: () => void): void;
              };
            };
            cam.changed?.addEventListener(onChanged);
            layers.current.changedCleanup = () => {
              try { cam.changed?.removeEventListener(onChanged); } catch { /* Best-effort. */ }
            };
          } catch {
            layers.current.changedCleanup = null;
          }
          layers.current.moveEndCleanup = () => {
            try { viewer!.camera.moveEnd.removeEventListener(updateHeight); } catch { /* Best-effort. */ }
          };
        } catch {
          /* LOD falls back to stale values. */
        }

        // Optional bathymetry where token allows.
        void applyBathymetry(viewer, token);

        // ── Primitive collections ────────────────────────────────────────
        const L = layers.current;
        try {
          if (Cesium.CustomDataSource) {
            L.obs = new Cesium.CustomDataSource('observations');
            viewer.dataSources.add(L.obs);
          }
          if (Cesium.PointPrimitiveCollection) {
            L.points = new Cesium.PointPrimitiveCollection();
            L.currentPts = new Cesium.PointPrimitiveCollection();
          }
          if (Cesium.PolylineCollection) {
            L.lines = new Cesium.PolylineCollection();
            L.grid = new Cesium.PolylineCollection();
          }
          if (L.points) viewer.scene.primitives.add(L.points);
          if (L.currentPts) viewer.scene.primitives.add(L.currentPts);
          if (L.lines) viewer.scene.primitives.add(L.lines);
          if (L.grid) {
            viewer.scene.primitives.add(L.grid);
            buildGraticule(Cesium, L.grid);
          }
        } catch {
          /* Layers are best-effort. */
        }

        // ── Click handler ────────────────────────────────────────────────
        try {
          if (Cesium.ScreenSpaceEventHandler && Cesium.ScreenSpaceEventType) {
            const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
            handler.setInputAction((movement) => {
              const p = live.current;
              const v = viewerRef.current;
              const C = getCesium();
              if (!v || !C) return;
              try {
                const picked = v.scene.pick(movement.position);
                const entityId = picked?.id?.id;
                if (typeof entityId === 'string' && entityId.startsWith('landing-obs-')) {
                  const obs = p.observations.find((o) => `landing-obs-${o.id}` === entityId);
                  p.onSelect(obs ?? null);
                  return;
                }
              } catch {
                /* Fall through to globe inspection. */
              }
              if (p.mode !== 'slice' && p.mode !== 'currents') return;
              try {
                const cart = v.camera.pickEllipsoid(movement.position);
                if (!cart || !C || !C.Cartographic?.fromCartesian) return;
                const carto = C.Cartographic.fromCartesian(cart);
                const lat = C.Math.toDegrees(carto.latitude);
                const lon = C.Math.toDegrees(carto.longitude);
                if (Number.isFinite(lat) && Number.isFinite(lon)) {
                  p.onInspect(lat, lon);
                }
              } catch {
                /* Clicks off-globe are ignored. */
              }
            }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
            L.handler = handler;
          }
        } catch {
          /* Globe remains navigable without picking. */
        }

        viewerRef.current = viewer;
        setGlobeReady(true);
      })
      .catch((e: unknown) => {
        if (!cancelled) setFailed(e instanceof Error ? e.message : 'Geographic globe unavailable.');
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  // Full teardown on unmount only.
  useEffect(
    () => () => {
      const v = viewerRef.current;
      const L = layers.current;
      viewerRef.current = null;
      try { L.moveEndCleanup?.(); } catch { /* Best-effort. */ }
      L.moveEndCleanup = null;
      try { L.changedCleanup?.(); } catch { /* Best-effort. */ }
      L.changedCleanup = null;
      if (L.currentAnim !== null) {
        try { cancelAnimationFrame(L.currentAnim); } catch { /* Best-effort. */ }
        L.currentAnim = null;
      }
      try { L.handler?.destroy(); } catch { /* Best-effort. */ }
      if (v && !v.isDestroyed()) {
        try { if (L.oceanImagery) v.imageryLayers.remove(L.oceanImagery, true); } catch { /* Best-effort. */ }
        try { if (L.obs) v.dataSources.remove(L.obs); } catch { /* Best-effort. */ }
        try { v.destroy(); } catch { /* Best-effort. */ }
      }
      L.oceanImagery = null;
      L.slice = null;
      L.outline = null;
      L.volumeSlices = [];
      L.points = null;
      L.currentPts = null;
      L.lines = null;
      L.grid = null;
      L.obs = null;
      L.handler = null;
      L.guides = [];
    },
    [],
  );

  const {
    frame,
    variable,
    mode,
    range,
    opacity,
    exaggeration,
    grid,
    currents,
    observations,
    density,
    selected,
    preset,
    cameraKey,
    threshold,
  } = props;

  // Camera presets: smooth flights.
  useEffect(() => {
    const v = viewerRef.current;
    if (v)
      flyToPreset(v, {
        dataset: live.current.dataset,
        preset: live.current.preset,
        depth: live.current.frame.slice.depth ?? 0,
        exaggeration: live.current.exaggeration,
      });
  }, [preset, cameraKey, globeReady]);

  // ── Scientific Ocean Layer (Globe Surface & Depth Slices) ────────────
  // Draped directly on the Cesium globe as an imagery layer.
  // Land is 100% transparent; ocean basins show the continuous scientific field.
  // NO rectangular box. NO floating plane. NO z-fighting with terrain.
  // Runs at 60 FPS with zero camera-move re-renders.
  useEffect(() => {
    const v = viewerRef.current;
    const Cesium = getCesium();
    const L = layers.current;
    if (L.slice) {
      try { v?.entities.remove(L.slice); } catch { /* Best-effort. */ }
      L.slice = null;
    }
    if (L.oceanImagery) {
      try { v?.imageryLayers.remove(L.oceanImagery, true); } catch { /* Best-effort. */ }
      L.oceanImagery = null;
    }
    if (!v || !Cesium || !globeReady || (mode !== 'slice' && mode !== 'currents'))
      return;
    try {
      const slice = frame.slice;
      const rows = slice.values as (number | null)[][];
      const nx = slice.longitudes.length;
      const nz = slice.latitudes.length;
      if (!nx || !nz || !Cesium.SingleTileImageryProvider) return;

      const isGlobal = (props.dataset.global ?? false) || domainWidth >= 120;
      const W = isGlobal ? 1024 : 512;
      const H = isGlobal ? 512 : 256;
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const [min, max] = range;

      if (isGlobal) {
        paintGlobalOcean(canvas, rows, slice.latitudes, slice.longitudes, {
          variable,
          min,
          max,
          opacity,
        });
      } else {
        paintContinuousField(canvas, rows, {
          variable,
          min,
          max,
          opacity,
          fadeEdge: true,
        });
      }

      const rect = isGlobal
        ? Cesium.Rectangle.fromDegrees(-180, -90, 180, 90)
        : Cesium.Rectangle.fromDegrees(
            slice.longitudes[0],
            slice.latitudes[0],
            slice.longitudes[nx - 1],
            slice.latitudes[nz - 1],
          );

      const provider = new Cesium.SingleTileImageryProvider({
        url: canvas.toDataURL('image/png'),
        rectangle: rect,
      });

      const layer = v.imageryLayers.addImageryProvider(provider) as { alpha?: number } | undefined;
      if (layer) layer.alpha = opacity;
      L.oceanImagery = layer;
    } catch {
      /* A bad frame must not break the globe. */
    }
  }, [frame, variable, mode, range, opacity, globeReady]);

  // ── Domain outline (Regional datasets only, never global) ──────────────
  useEffect(() => {
    const v = viewerRef.current;
    const Cesium = getCesium();
    const L = layers.current;
    if (L.outline) {
      try { v?.entities.remove(L.outline); } catch { /* Best-effort. */ }
      L.outline = null;
    }
    const isGlobal = (props.dataset.global ?? false) || domainWidth >= 120;
    if (isGlobal || !v || !Cesium || !globeReady || !Cesium.Rectangle || !showOutline) return;
    try {
      const slice = frame.slice;
      const nx = slice.longitudes.length;
      const nz = slice.latitudes.length;
      if (!nx || !nz) return;
      L.outline = v.entities.add({
        id: 'domain-outline',
        rectangle: {
          coordinates: Cesium.Rectangle.fromDegrees(
            slice.longitudes[0],
            slice.latitudes[0],
            slice.longitudes[nx - 1],
            slice.latitudes[nz - 1],
          ),
          height: 2500,
          fill: false,
          outline: true,
          outlineColor: new Cesium.Color(0.09, 0.78, 0.91, 0.45),
        },
      });
    } catch {
      /* A bad frame must not break the globe. */
    }
  }, [frame, showOutline, globeReady]);

  // ── True 3D water column (volume / iso modes) ─────────────────────────
  useEffect(() => {
    const L = layers.current;
    const Cesium = getCesium();
    const v = viewerRef.current;
    try { L.points?.removeAll(); } catch { /* Best-effort. */ }
    for (const e of L.volumeSlices) {
      try { v?.entities.remove(e); } catch { /* Best-effort. */ }
    }
    L.volumeSlices = [];
    if (!v || !Cesium || !L.points || !globeReady) return;
    if (mode !== 'volume' && mode !== 'iso') return;

    try {
      const volume = frame.volume;
      const layers3 = volume.values as (number | null)[][][];
      const nx = volume.longitudes.length;
      const nz = volume.latitudes.length;
      const IMP = Cesium.ImageMaterialProperty;
      if (!nx || !nz || !Cesium.Rectangle || !IMP) return;

      const tolerance = (range[1] - range[0]) * 0.035;
      const color = new Color();
      const [min, max] = range;
      const isoOn = mode === 'iso';
      const isGlobal = (props.dataset.global ?? false) || domainWidth >= 120;
      const VW = isGlobal ? 512 : 256;
      const VH = isGlobal ? 256 : 128;
      const rect = isGlobal
        ? Cesium.Rectangle.fromDegrees(-180, -90, 180, 90)
        : Cesium.Rectangle.fromDegrees(
            volume.longitudes[0],
            volume.latitudes[0],
            volume.longitudes[nx - 1],
            volume.latitudes[nz - 1],
          );

      // Clean representative depth levels (subsurface, thermocline, intermediate, deep)
      const targetIndices = [1, 3, 6, Math.min(8, layers3.length - 1)];

      targetIndices.forEach((k) => {
        if (k >= layers3.length) return;
        const layer = layers3[k];
        const depth = volume.depths[k] ?? 0;
        const h = depthHeight(depth, exaggeration);

        try {
          const canvas = document.createElement('canvas');
          canvas.width = VW;
          canvas.height = VH;
          if (isGlobal) {
            paintGlobalOcean(canvas, layer, volume.latitudes, volume.longitudes, {
              variable,
              min,
              max,
              opacity: isoOn ? opacity * 0.9 : opacity * 0.55,
              isoThreshold: isoOn ? threshold : null,
              isoTolerance: tolerance,
            });
          } else {
            paintContinuousField(canvas, layer, {
              variable,
              min,
              max,
              opacity: isoOn ? opacity * 0.9 : opacity * 0.55,
              isoThreshold: isoOn ? threshold : null,
              isoTolerance: tolerance,
              fadeEdge: true,
            });
          }
          const entity = v.entities.add({
            id: `volume-level-${k}`,
            rectangle: {
              coordinates: rect,
              material: new IMP({ image: canvas, transparent: true }),
              height: h,
            },
          });
          L.volumeSlices.push(entity);
        } catch {
          /* One bad level must not kill the column. */
        }
      });

      // Spatial point sampling for close volumetric inspection (capped at 1,500 points)
      const stride = isGlobal ? 3 : 2;
      let ptCount = 0;
      const maxPts = 1500;
      for (const k of targetIndices) {
        if (k >= layers3.length || ptCount >= maxPts) break;
        const layer = layers3[k];
        const depth = volume.depths[k] ?? 0;
        const h = depthHeight(depth, exaggeration);

        for (let j = 0; j < nz && ptCount < maxPts; j += stride) {
          const row = layer[j];
          for (let i = 0; i < nx && ptCount < maxPts; i += stride) {
            const value = row[i];
            if (value === null) continue;
            if (isoOn && Math.abs(value - threshold) > tolerance) continue;
            dataColor(value, variable, min, max, color);
            L.points.add({
              position: Cesium.Cartesian3.fromDegrees(volume.longitudes[i], volume.latitudes[j], h),
              color: new Cesium.Color(color.r, color.g, color.b, isoOn ? 0.9 : 0.65),
              pixelSize: isoOn ? 5 : 3,
            });
            ptCount++;
          }
        }
      }
    } catch {
      /* A bad frame must not break the globe. */
    }
  }, [
    frame,
    variable,
    mode,
    range,
    opacity,
    exaggeration,
    threshold,
    globeReady,
  ]);

  // ── Current field ──────────────────────────────────────────────────────
  // Direction, magnitude and distribution are backend u/v only — no fake particles.
  // Pre-allocates PointPrimitives once; updates .position in-place for 60 FPS smoothness.
  useEffect(() => {
    const L = layers.current;
    const Cesium = getCesium();
    try { L.lines?.removeAll(); } catch { /* Best-effort. */ }
    try { L.currentPts?.removeAll(); } catch { /* Best-effort. */ }
    if (L.currentAnim !== null) {
      try { cancelAnimationFrame(L.currentAnim); } catch { /* Best-effort. */ }
      L.currentAnim = null;
    }
    if (!viewerRef.current || !Cesium || !L.lines || !L.currentPts || !globeReady) return;
    if (!currents || !frame.currents) return;

    try {
      const field = frame.currents;
      const h = depthHeight(field.depth, exaggeration) + 2000;
      const step = density >= 2200 ? 3 : density >= 1200 ? 4 : 5;
      const cap = Math.min(600, Math.max(150, density));
      let drawn = 0;

      for (let j = 0; j < field.latitudes.length && drawn < cap; j += step) {
        for (let i = 0; i < field.longitudes.length && drawn < cap; i += step) {
          let lon = field.longitudes[i];
          let lat = field.latitudes[j];
          const path: unknown[] = [];
          for (let s = 0; s < 5; s++) {
            const uv = samplePoint(field, lon, lat);
            if (!uv) break;
            path.push(Cesium.Cartesian3.fromDegrees(lon, lat, h));
            lon += uv[0] * 1.5;
            lat += uv[1] * 1.5;
          }
          if (path.length > 1 && Cesium.Material) {
            L.lines.add({
              positions: path,
              width: 1.5,
              material: Cesium.Material.fromType(Cesium.Material.ColorType, {
                color: new Cesium.Color(0.85, 0.96, 1, 0.42),
              }),
            });
            drawn++;
          }
        }
      }

      // Collect wet ocean locations for particle seeds
      const wet: [number, number][] = [];
      for (let j = 0; j < field.latitudes.length; j += 2)
        for (let i = 0; i < field.longitudes.length; i += 2)
          if (samplePoint(field, field.longitudes[i], field.latitudes[j]))
            wet.push([field.longitudes[i], field.latitudes[j]]);
      if (!wet.length) return;

      const count = Math.min(400, Math.max(120, Math.floor(density / 3)));
      let seed = 41 + field.time * 97 + Math.floor(field.depth);
      const rand = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      };

      const parts = Array.from({ length: count }, () => {
        const w = wet[Math.floor(rand() * wet.length)] ?? [0, 0];
        return { lon: w[0], lat: w[1], life: 4 + rand() * 8, age: rand() * 8 };
      });

      // Allocate PointPrimitives ONCE
      const primitives: import('../cesium/cesiumTypes').CesiumPointItem[] = [];
      for (let i = 0; i < parts.length; i++) {
        const pt = L.currentPts.add({
          position: Cesium.Cartesian3.fromDegrees(parts[i].lon, parts[i].lat, h + 400),
          color: new Cesium.Color(0.75, 0.93, 1, 0),
          pixelSize: 4,
        });
        primitives.push(pt as import('../cesium/cesiumTypes').CesiumPointItem);
      }

      let last = performance.now();
      const tick = (now: number) => {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;

        for (let i = 0; i < parts.length; i++) {
          const p = parts[i];
          p.age += dt;
          let uv = samplePoint(field, p.lon, p.lat);
          if (!uv || p.age > p.life) {
            const w = wet[Math.floor(rand() * wet.length)];
            if (!w) continue;
            p.lon = w[0];
            p.lat = w[1];
            p.age = 0;
            uv = samplePoint(field, p.lon, p.lat);
          }
          if (!uv) continue;
          const dl = (uv[0] * 250000) / 111320 / Math.max(0.2, Math.cos((p.lat * Math.PI) / 180));
          const da = (uv[1] * 250000) / 111320;
          p.lon += dl * dt;
          p.lat += da * dt;
          if (p.lon > 180) p.lon -= 360;
          if (p.lon < -180) p.lon += 360;

          const speed = Math.hypot(uv[0], uv[1]);
          const bright = Math.min(1, 0.35 + speed * 2.2);
          const fade = Math.min(1, p.age / 0.5, (p.life - p.age) / 0.8);
          const a = Math.max(0, fade) * 0.9;

          const prim = primitives[i];
          if (prim) {
            prim.position = Cesium.Cartesian3.fromDegrees(p.lon, p.lat, h + 400);
            prim.color = new Cesium.Color(0.75 * bright, 0.93 * bright, 1 * bright, a);
          }
        }
        L.currentAnim = requestAnimationFrame(tick);
      };
      L.currentAnim = requestAnimationFrame(tick);
    } catch {
      /* A bad frame must not break the globe. */
    }
    return () => {
      if (L.currentAnim !== null) {
        try { cancelAnimationFrame(L.currentAnim); } catch { /* Best-effort. */ }
        L.currentAnim = null;
      }
    };
  }, [frame, currents, exaggeration, density, globeReady]);

  // ── Observations at true lat/lon ──────────────────────────────────────
  useEffect(() => {
    const v = viewerRef.current;
    if (!v || !layers.current.obs || !globeReady) return;
    syncObservationEntities(
      { ...v, entities: layers.current.obs.entities } as CesiumViewer,
      observations.map((o) => ({
        id: o.id,
        instrument_type: o.instrument_type,
        latitude: o.latitude,
        longitude: o.longitude,
        max_depth: o.max_depth,
        timestamp: o.timestamp,
      })),
      { visible: true, selectedId: selected, scale: 0.55 },
    );
  }, [observations, selected, globeReady]);

  // ── Water-column guides for each observation ──────────────────────────
  useEffect(() => {
    const L = layers.current;
    const Cesium = getCesium();
    for (const id of L.guides) {
      try { L.obs?.entities.removeById(id); } catch { /* Best-effort. */ }
    }
    L.guides = [];
    const v = viewerRef.current;
    if (!v || !L.obs || !Cesium || !globeReady) return;
    try {
      for (const o of observations) {
        if (!o.max_depth || o.max_depth <= 0) continue;
        const id = `obs-guide-${o.id}`;
        L.obs.entities.add({
          id,
          polyline: {
            positions: [
              Cesium.Cartesian3.fromDegrees(o.longitude, o.latitude, 25000),
              Cesium.Cartesian3.fromDegrees(
                o.longitude,
                o.latitude,
                depthHeight(o.max_depth, exaggeration),
              ),
            ],
            width: 1,
            material: new Cesium.Color(0.09, 0.78, 0.91, 0.22),
          },
        });
        L.guides.push(id);
      }
    } catch {
      /* Guides are decorative; markers carry the interaction. */
    }
  }, [observations, exaggeration, globeReady]);

  // ── Reference grid toggle ─────────────────────────────────────────────
  useEffect(() => {
    if (!globeReady) return;
    try {
      if (layers.current.grid) layers.current.grid.show = grid;
    } catch {
      /* Best-effort. */
    }
  }, [grid, globeReady]);

  // ── Globe translucency for dive modes ─────────────────────────────────
  useEffect(() => {
    const v = viewerRef.current;
    if (!v || !globeReady) return;
    const diving = mode === 'volume' || mode === 'iso';
    try {
      v.scene.globe.translucency.enabled = diving;
      v.scene.globe.translucency.frontFaceAlpha = diving ? 0.82 : 1.0;
      v.scene.globe.translucency.backFaceAlpha = 0.0; // NEVER show back side of globe
      v.scene.globe.depthTestAgainstTerrain = !diving;
    } catch {
      /* Older builds keep an opaque globe; layers still render. */
    }
  }, [mode, globeReady]);

  if (!enabled) return null;
  if (failed)
    return (
      <div className="error-screen">
        <h2>Geographic globe unavailable</h2>
        <p>{failed} Panels, timeline and analysis remain functional.</p>
        <button onClick={() => window.location.reload()}>Restart viewer</button>
      </div>
    );
  return <div ref={host} className="cesium-viewer-host" aria-label="Global ocean globe" />;
}

function samplePoint(
  field: NonNullable<Frame['currents']>,
  lon: number,
  lat: number,
): [number, number] | null {
  try {
    return sample(field, lon, lat);
  } catch {
    return null;
  }
}

// Subtle geographic grid — extremely faint so it reads as texture not primary visual structure.
function buildGraticule(
  Cesium: Exclude<ReturnType<typeof getCesium>, null>,
  grid: import('../cesium/cesiumTypes').CesiumLineCollection,
) {
  const C = Cesium;
  if (!C.Material) throw new Error('Cesium Material API unavailable.');
  const dim = C.Material.fromType(C.Material.ColorType, {
    color: new C.Color(0.55, 0.68, 0.78, 0.05),
  });
  for (let lon = -180; lon < 180; lon += 15) {
    const path: unknown[] = [];
    for (let lat = -90; lat <= 90; lat += 3) path.push(C.Cartesian3.fromDegrees(lon, lat, 500));
    grid.add({ positions: path, width: 1, material: dim });
  }
  for (let lat = -75; lat <= 75; lat += 15) {
    const path: unknown[] = [];
    for (let lon = -180; lon <= 180; lon += 3) path.push(C.Cartesian3.fromDegrees(lon, lat, 500));
    grid.add({ positions: path, width: 1, material: dim });
  }
}

function gradeBaseLayer(viewer: CesiumViewer, type: 'satellite' | 'osm') {
  try {
    const layer = viewer.imageryLayers.get(0) as unknown as Record<string, unknown>;
    if (type === 'satellite') {
      layer['brightness'] = 0.95;
      layer['saturation'] = 0.9;
      layer['contrast'] = 1.0;
      layer['gamma'] = 1.0;
    } else {
      layer['brightness'] = 0.55;
      layer['saturation'] = 0.25;
      layer['contrast'] = 1.1;
      layer['gamma'] = 0.85;
      layer['hue'] = 0.6;
    }
  } catch {
    /* Raw imagery remains. */
  }
}

// Enhanced offline Earth: 4K equirectangular canvas with ocean + continents.
async function buildEnhancedEarth(
  Cesium: Exclude<ReturnType<typeof getCesium>, null>,
): Promise<unknown | null> {
  if (!Cesium.SingleTileImageryProvider) return null;
  const res = await fetch('/world-land.geojson');
  if (!res.ok) return null;
  const geo = (await res.json()) as {
    features?: { geometry?: { type?: string; coordinates?: unknown } }[];
  };

  const W = 4096;
  const H = 2048;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Ocean fill: deep gradient from pole to pole.
  const oceanGrad = ctx.createLinearGradient(0, 0, 0, H);
  oceanGrad.addColorStop(0.0, '#10407a');
  oceanGrad.addColorStop(0.35, '#0d3568');
  oceanGrad.addColorStop(0.5, '#0b2f5e');
  oceanGrad.addColorStop(0.65, '#0d3568');
  oceanGrad.addColorStop(1.0, '#10407a');
  ctx.fillStyle = oceanGrad;
  ctx.fillRect(0, 0, W, H);

  const X = (lon: number) => ((lon + 180) / 360) * W;
  const Y = (lat: number) => ((90 - lat) / 180) * H;

  const trace = (ring: unknown) => {
    const pts = ring as [number, number][];
    pts.forEach(([lon, lat], i) => {
      if (i === 0) ctx.moveTo(X(lon), Y(lat));
      else ctx.lineTo(X(lon), Y(lat));
    });
    ctx.closePath();
  };

  // Land fills
  const landGrad = ctx.createLinearGradient(0, 0, W, 0);
  landGrad.addColorStop(0.0, '#5d8148');
  landGrad.addColorStop(0.3, '#4f7340');
  landGrad.addColorStop(0.7, '#4b6d3c');
  landGrad.addColorStop(1.0, '#3f5f34');
  ctx.fillStyle = landGrad;

  for (const feature of geo.features ?? []) {
    const geometry = feature.geometry;
    if (!geometry) continue;
    ctx.beginPath();
    if (geometry.type === 'Polygon') {
      (geometry.coordinates as unknown[][][]).forEach(trace);
    } else if (geometry.type === 'MultiPolygon') {
      (geometry.coordinates as unknown[][][][]).forEach((polygon) => polygon.forEach(trace));
    } else {
      continue;
    }
    ctx.fill('evenodd');
  }

  // Arid/desert overlay
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = 'rgba(160, 120, 55, 0.18)';
  ctx.fillRect(0, Y(40), W, Y(-10) - Y(40));
  ctx.restore();

  // Coastline strokes
  ctx.strokeStyle = 'rgba(140, 195, 210, 0.65)';
  ctx.lineWidth = 1.5;
  for (const feature of geo.features ?? []) {
    const geometry = feature.geometry;
    if (!geometry) continue;
    ctx.beginPath();
    if (geometry.type === 'Polygon') {
      (geometry.coordinates as unknown[][][]).forEach(trace);
    } else if (geometry.type === 'MultiPolygon') {
      (geometry.coordinates as unknown[][][][]).forEach((polygon) => polygon.forEach(trace));
    } else {
      continue;
    }
    ctx.stroke();
  }

  // Ice caps
  ctx.fillStyle = 'rgba(230, 240, 245, 0.72)';
  ctx.fillRect(0, 0, W, Y(72));
  ctx.fillRect(0, Y(-72), W, H - Y(-72));
  const arcticFade = ctx.createLinearGradient(0, Y(72), 0, Y(62));
  arcticFade.addColorStop(0, 'rgba(230, 240, 245, 0.72)');
  arcticFade.addColorStop(1, 'rgba(230, 240, 245, 0)');
  ctx.fillStyle = arcticFade;
  ctx.fillRect(0, Y(72), W, Y(62) - Y(72));
  const antarFade = ctx.createLinearGradient(0, Y(-72), 0, Y(-62));
  antarFade.addColorStop(0, 'rgba(230, 240, 245, 0)');
  antarFade.addColorStop(1, 'rgba(230, 240, 245, 0.72)');
  ctx.fillStyle = antarFade;
  ctx.fillRect(0, Y(-72), W, Y(-62) - Y(-72));

  return new Cesium.SingleTileImageryProvider({ url: canvas.toDataURL('image/png') });
}

function flyToPreset(
  v: CesiumViewer,
  p: { dataset: Dataset; preset: CameraPreset; depth?: number; exaggeration?: number },
) {
  const Cesium = getCesium();
  if (!Cesium) return;
  const ext = domainExtents(p.dataset);
  const ex = p.exaggeration ?? 5;
  const diveDepthFor = (preset: CameraPreset, fallback: number): number => {
    if (preset === 'dive-200m') return 200;
    if (preset === 'dive-500m') return 500;
    if (preset === 'dive-1000m') return 1000;
    if (preset === 'dive-2000m') return 2000;
    return fallback;
  };
  const depth = diveDepthFor(p.preset, p.depth ?? 0);

  // Ocean-basin presets use hard-coded geographic centres.
  const basinPreset = OCEAN_PRESETS[p.preset];

  let flight: { lon: number; lat: number; h: number; pitch: number };

  if (basinPreset && !['domain', 'surface', 'underwater'].includes(p.preset)) {
    // Fixed-position ocean basin or global view.
    flight = basinPreset;
  } else if (p.preset === 'global') {
    flight = { lon: 0, lat: 20, h: 20_000_000, pitch: -90 };
  } else if (p.preset === 'approach') {
    flight = { lon: ext.centerLon, lat: ext.centerLat + 6, h: 11_000_000, pitch: -75 };
  } else if (p.preset === 'domain') {
    flight = { lon: ext.centerLon, lat: ext.centerLat, h: 5_500_000, pitch: -80 };
  } else if (p.preset === 'surface') {
    flight = { lon: ext.centerLon, lat: ext.centerLat, h: 1_800_000, pitch: -90 };
  } else {
    // Dive presets: depth-coupled camera.
    flight = {
      lon: ext.centerLon,
      lat: Math.max(ext.south, ext.centerLat - 4),
      h: diveCameraHeight(depth, ex),
      pitch: -65,
    };
  }

  try { v.camera.cancelFlight(); } catch { /* No flight in progress. */ }
  try {
    v.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(flight.lon, flight.lat, flight.h),
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(flight.pitch),
        roll: 0,
      },
      duration: ['global', 'approach', 'pacific', 'atlantic', 'indian', 'southern', 'arctic'].includes(p.preset) ? 2.8 : 2.4,
    });
  } catch {
    /* A failed flight must not break the explorer. */
  }
}
