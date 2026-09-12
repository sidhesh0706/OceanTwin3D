import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, Line, OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import type { CameraPreset, Dataset, Frame, Land, Mode, Observation, Variable } from '../types';
import { projection, depthY } from './coordinates';
import { viewAngles } from './frameFit';
// Console marker proving which 3D framing code a session runs (rev 8:
// near-frontal oblique + gated focus + screen-space depth rail).
import { Slice, Volume, SectionCurtain } from './Fields';
import { CurrentParticles } from './CurrentParticles';

interface SceneProps {
  dataset: Dataset;
  frame: Frame;
  land: Land | null;
  variable: Variable;
  mode: Mode;
  range: [number, number];
  opacity: number;
  exaggeration: number;
  grid: boolean;
  currents: boolean;
  density: number;
  observations: Observation[];
  selected: string | null;
  onSelect: (o: Observation) => void;
  onInspect: (lat: number, lon: number) => void;
  preset: CameraPreset;
  cameraKey: number;
  threshold: number;
}

function Geography({ land, dataset }: { land: Land | null; dataset: Dataset }) {
  const shapes = useMemo(() => {
    const p = projection(dataset),
      result: { geometry: THREE.ExtrudeGeometry; lines: [number, number, number][][] }[] = [];
    land?.features.forEach((f) => {
      const polygons =
        f.geometry.type === 'Polygon'
          ? [f.geometry.coordinates as number[][][]]
          : (f.geometry.coordinates as number[][][][]);
      polygons.forEach((rings) => {
        const outer = rings[0];
        if (!outer?.length) return;
        const shape = new THREE.Shape(
          outer.map(([lon, lat]) => new THREE.Vector2(p.x(lon), -p.z(lat))),
        );
        rings
          .slice(1)
          .forEach((ring) =>
            shape.holes.push(
              new THREE.Path(ring.map(([lon, lat]) => new THREE.Vector2(p.x(lon), -p.z(lat)))),
            ),
          );
        const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.085, bevelEnabled: false });
        geometry.rotateX(-Math.PI / 2);
        result.push({
          geometry,
          lines: rings.map((ring) => ring.map(([lon, lat]) => [p.x(lon), 0.105, p.z(lat)])),
        });
      });
    });
    return result;
  }, [land, dataset]);
  useEffect(() => () => shapes.forEach((s) => s.geometry.dispose()), [shapes]);
  // Geometry is clipped by the backend to this local model window.
  return (
    <group>
      {shapes.map((s, i) => (
        <group key={i}>
          <mesh geometry={s.geometry}>
            <meshStandardMaterial color="#263b48" roughness={1} metalness={0.1} />
          </mesh>
          {s.lines.map((points, j) => (
            <Line
              key={j}
              points={points}
              color="#71918f"
              transparent
              opacity={0.65}
              lineWidth={0.8}
            />
          ))}
        </group>
      ))}
    </group>
  );
}

function Reference({
  dataset,
  exaggeration,
  grid,
  topDown,
}: {
  dataset: Dataset;
  exaggeration: number;
  grid: boolean;
  topDown: boolean;
}) {
  const p = projection(dataset),
    w = p.width / 2,
    h = p.height / 2,
    bottom = depthY(dataset.bounds.depth[1], exaggeration);
  const levels = topDown ? [0] : [0, ...dataset.depths.filter((d) => d >= 500)];
  const unique = [...new Set(levels)].filter(
    (_, i, a) => a.length < 7 || i % 2 === 0 || i === a.length - 1,
  );
  const edges: [[number, number, number], [number, number, number]][] = [];
  for (const x of [-w, w])
    for (const z of [-h, h])
      edges.push([
        [x, 0, z],
        [x, bottom, z],
      ]);
  return (
    <group>
      <mesh position={[0, bottom - 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[p.width, p.height]} />
        <meshBasicMaterial color="#0d2330" transparent opacity={0.75} side={THREE.DoubleSide} />
      </mesh>
      {[0, bottom].map((y) => (
        <Line
          key={y}
          points={[
            [-w, y, -h],
            [w, y, -h],
            [w, y, h],
            [-w, y, h],
            [-w, y, -h],
          ]}
          color="#417082"
          transparent
          opacity={0.45}
          lineWidth={0.7}
        />
      ))}
      {edges.map((points, i) => (
        <Line
          key={i}
          points={points}
          color="#406577"
          dashed
          dashSize={0.08}
          gapSize={0.08}
          transparent
          opacity={0.5}
        />
      ))}
      {unique.map((d) => (
        <group key={d}>
          <Line
            points={[
              [w, depthY(d, exaggeration), h],
              [w + 0.25, depthY(d, exaggeration), h],
            ]}
            color="#668490"
          />
        </group>
      ))}
      {grid &&
        Array.from({ length: 10 }, (_, i) => {
          const x = -w + (i * p.width) / 9;
          return (
            <Line
              key={`x${i}`}
              points={[
                [x, bottom, -h],
                [x, bottom, h],
              ]}
              color="#335364"
              transparent
              opacity={0.38}
              lineWidth={0.5}
            />
          );
        })}
      {grid &&
        Array.from({ length: 8 }, (_, i) => {
          const z = -h + (i * p.height) / 7;
          return (
            <Line
              key={`z${i}`}
              points={[
                [-w, bottom, z],
                [w, bottom, z],
              ]}
              color="#335364"
              transparent
              opacity={0.38}
              lineWidth={0.5}
            />
          );
        })}
      <Html position={[-w, 0, h + 0.35]} center>
        <span className="geo-coordinate">{geoLabel(dataset.bounds.longitude[0], true)}</span>
      </Html>
      <Html position={[w, 0, h + 0.35]} center>
        <span className="geo-coordinate">{geoLabel(dataset.bounds.longitude[1], true)}</span>
      </Html>
    </group>
  );
}

/**
 * Screen-space depth rail: projects the depth-axis anchors every frame and
 * lays the labels out vertically with a guaranteed minimum gap, so they can
 * never overlap or leave the viewport. Pure annotation overlay — it changes
 * no geometry, no camera, no field. Replaces the old world-space ticks.
 */
export const DEPTH_RAIL_LEVELS = [0, 100, 500, 1000, 2000];
const RAIL_GAP_PX = 22;
const RAIL_ROW_H = 26;

function DepthRail({
  dataset,
  exaggeration,
  depth,
  anchor,
}: {
  dataset: Dataset;
  exaggeration: number;
  depth: number;
  anchor: { x: number; z: number };
}) {
  const { camera, size } = useThree();
  const p = useMemo(() => projection(dataset), [dataset]);
  const maxDepth = dataset.bounds.depth[1];
  const levels = useMemo(() => DEPTH_RAIL_LEVELS.filter((d) => d <= maxDepth), [maxDepth]);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const lineRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const rail = railRef.current;
    if (!rail) return;
    const W = size.width;
    const H = size.height;
    const ax = p.width / 2 + 0.35;
    const az = p.height / 2;
    const pts = levels.map((d) => {
      v.set(ax, depthY(d, exaggeration), az).project(camera);
      return { d, x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H, ok: v.z < 1 };
    });
    const onScreen = pts.every((q) => q.ok) && pts[0].x > -60 && pts[0].x < W + 60;
    rail.style.opacity = onScreen ? '1' : '0';
    if (!onScreen) return;
    const ys = pts.map((q) => q.y);
    for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + RAIL_GAP_PX);
    const overflow = ys[ys.length - 1] + RAIL_ROW_H / 2 - (H - 10);
    if (overflow > 0) for (let i = 0; i < ys.length; i++) ys[i] -= overflow;
    const underflow = ys[0] - RAIL_ROW_H / 2 - 10;
    if (underflow < 0) for (let i = 0; i < ys.length; i++) ys[i] -= underflow;
    const railX = Math.min(W - 96, Math.max(10, pts[0].x + 12));
    const line = lineRef.current;
    if (line) {
      line.style.left = `${railX.toFixed(1)}px`;
      line.style.top = `${ys[0].toFixed(1)}px`;
      line.style.height = `${Math.max(0, ys[ys.length - 1] - ys[0]).toFixed(1)}px`;
    }
    rowRefs.current.forEach((el, i) => {
      if (el)
        el.style.transform = `translate(${railX.toFixed(1)}px, ${(ys[i] - RAIL_ROW_H / 2).toFixed(1)}px)`;
    });
  });
  return (
    <Html
      position={[anchor.x, 0, anchor.z]}
      calculatePosition={(_, __, viewport) => [viewport.width / 2, viewport.height / 2]}
      zIndexRange={[25, 0]}
      style={{ pointerEvents: 'none' }}
      fullscreen
    >
      <div ref={railRef} className="depth-rail" style={{ opacity: 0 }}>
        <div ref={lineRef} className="depth-rail-line" />
        {levels.map((d, i) => (
          <div
            key={d}
            ref={(el) => {
              rowRefs.current[i] = el;
            }}
            className={`depth-rail-row${d === depth ? ' active' : ''}`}
          >
            <i />
            <span>{d === 0 ? 'SURFACE' : `${d.toLocaleString()} m`}</span>
          </div>
        ))}
      </div>
    </Html>
  );
}

function geoLabel(value: number, longitude = false) {
  const n = longitude ? ((((value + 180) % 360) + 360) % 360) - 180 : value;
  return `${Math.abs(n).toFixed(1)}°${longitude ? (n < 0 ? 'W' : 'E') : n < 0 ? 'S' : 'N'}`;
}

function CameraRig({
  preset,
  cameraKey,
  dataset,
  exaggeration,
  focus,
}: {
  preset: CameraPreset;
  cameraKey: number;
  dataset: Dataset;
  exaggeration: number;
  /**
   * Selected-observation anchor in world x/z. 3D ONLY: the framing target
   * leans toward it. Top-down keeps the region center (original behavior).
   */
  focus: { x: number; z: number } | null;
}) {
  const controls = useRef<OrbitControlsImpl>(null),
    moving = useRef(true);
  const logged = useRef('');
  const { camera, size } = useThree();
  const underwater = preset === 'underwater' || preset.startsWith('dive-');
  const bottom = depthY(dataset.bounds.depth[1], exaggeration);
  const target = useMemo(() => {
    const t = new THREE.Vector3(0, preset === 'surface' ? 0 : bottom / 2, 0);
    // 3D ONLY: lean the target toward the selected observation so it sits
    // near the visual center. The fit corners are evaluated relative to the
    // target, so containment is preserved. Top-down keeps region center.
    if (preset !== 'surface' && focus) {
      t.x += focus.x * 0.35;
      t.z += focus.z * 0.35;
    }
    return t;
  }, [preset, bottom, focus?.x, focus?.z]);
  const footprint = projection(dataset);
  const position = useMemo(() => {
    const p = footprint;
    // Near-frontal oblique for 3D (~20° down, ~5° azimuth): north stays up,
    // the diagonal-card effect is gone. Dives stay near-horizontal, the
    // surface map stays top-down. This direction is the ONLY framing change
    // versus the original renderer; the fit math below is untouched.
    const direction = new THREE.Vector3(
      ...((preset === 'surface'
        ? [0, 1, 0.001]
        : underwater
          ? [1, 0.15, 1.4]
          : [0.15, 0.62, 1.7]) as [number, number, number]),
    ).normalize();
    const right = new THREE.Vector3()
      .crossVectors(new THREE.Vector3(0, 1, 0), direction)
      .normalize();
    const up = new THREE.Vector3().crossVectors(direction, right).normalize();
    const tanV = Math.tan(THREE.MathUtils.degToRad(43 / 2));
    const tanH = (tanV * size.width) / Math.max(1, size.height);
    let distance = 7;
    for (const x of [-p.width / 2 - 0.8, p.width / 2 + 0.8])
      for (const z of [-p.height / 2 - 0.5, p.height / 2 + 0.5])
        for (const y of preset === 'surface' ? [0] : [0, bottom]) {
          const v = new THREE.Vector3(x, y, z).sub(target);
          distance = Math.max(
            distance,
            v.dot(direction) + Math.abs(v.dot(right)) / tanH,
            v.dot(direction) + Math.abs(v.dot(up)) / tanV,
          );
        }
    return target.clone().addScaledVector(direction, distance * 1.08);
  }, [
    preset,
    underwater,
    footprint.width,
    footprint.height,
    bottom,
    target,
    size.width,
    size.height,
  ]);
  useEffect(() => {
    moving.current = true;
  }, [preset, cameraKey, position]);
  // Proof-of-run marker: paste this console line when reporting framing.
  useEffect(() => {
    const a = viewAngles([0.15, 0.62, 1.7]);
    const key = `rev=8 preset=${preset} elev=${a.elevationDeg.toFixed(1)} az=${a.azimuthDeg.toFixed(1)}`;
    if (logged.current !== key) {
      logged.current = key;
      console.info(`[OceanTwin 3D] ${key}`);
    }
  }, [preset, position]);
  useFrame((_, dt) => {
    if (!moving.current || !controls.current) return;
    camera.position.lerp(position, 1 - Math.exp(-dt * 6));
    controls.current.target.lerp(target, 1 - Math.exp(-dt * 6));
    controls.current.update();
    if (camera.position.distanceTo(position) < 0.025) moving.current = false;
  });
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minDistance={7}
      maxDistance={100}
      // 3D never flops fully top-down (labels would stack) nor far under
      // the plane; the surface map keeps full orbit freedom.
      minPolarAngle={preset === 'surface' ? 0 : 0.85}
      maxPolarAngle={preset === 'surface' ? Math.PI * 0.52 : Math.PI * 0.86}
      onStart={() => {
        moving.current = false;
      }}
    />
  );
}

function Instruments({
  observations,
  dataset,
  selected,
  onSelect,
  exaggeration,
}: {
  observations: Observation[];
  dataset: Dataset;
  selected: string | null;
  onSelect: (o: Observation) => void;
  exaggeration: number;
}) {
  const p = projection(dataset);
  return (
    <group>
      {observations.map((o) => {
        const active = o.id === selected;
        return (
          <group key={o.id} position={[p.x(o.longitude), 0.16, p.z(o.latitude)]}>
            {active && (
              <Line
                points={[
                  [0, 0, 0],
                  [0, depthY(o.max_depth, exaggeration), 0],
                ]}
                color="#a8f5e0"
                dashed
                dashSize={0.08}
                gapSize={0.06}
                transparent
                opacity={0.8}
              />
            )}
            <Html center distanceFactor={25} zIndexRange={[20, 0]}>
              <button
                className={`instrument-marker ${o.instrument_type === 'GLIDER' ? 'glider' : ''} ${active ? 'selected' : ''}`}
                aria-label={`Select ${o.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(o);
                }}
                title={`${o.id} · ${o.max_depth} m · Synthetic profile`}
              >
                <span />
                {active && <small>{o.id}</small>}
              </button>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

// Shared OceanTwin star language — also used by the splash and panel CSS:
// ~60% soft white, ~30% cool blue, ~10% brighter cyan. Two static shells
// (no DOM, no per-frame allocation): a dim 1px-class field plus a sparse
// brighter tier with one slow global luminance breath. Brightness is kept
// far below the ocean data by construction; fog-exempt so engine fog
// (tuned for the region volume) never swallows the backdrop.
type StarTint = [number, number, number];
const STAR_WHITES: StarTint[] = [
  [1, 1, 1],
  [0.91, 0.95, 0.97],
  [0.8, 0.84, 0.88],
];
const STAR_BLUES: StarTint[] = [
  [0.23, 0.51, 0.96],
  [0.15, 0.39, 0.92],
];
const STAR_CYANS: StarTint[] = [
  [0.13, 0.83, 0.93],
  [0.22, 0.74, 0.97],
];
function BackdropStars() {
  const brightMaterial = useRef<THREE.PointsMaterial>(null);
  const shells = useMemo(() => {
    let seed = 20260902;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const pick = (list: StarTint[]) => list[Math.floor(rand() * list.length)] ?? list[0];
    const make = (count: number, bright: boolean) => {
      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const u = rand() * 2 - 1,
          theta = rand() * Math.PI * 2,
          r = 55 + rand() * 30,
          s = Math.sqrt(1 - u * u);
        positions[i * 3] = r * s * Math.cos(theta);
        positions[i * 3 + 1] = r * u * 0.6;
        positions[i * 3 + 2] = r * s * Math.sin(theta);
        const roll = rand();
        const c = bright
          ? roll < 0.5
            ? pick(STAR_CYANS)
            : roll < 0.85
              ? pick(STAR_BLUES)
              : pick(STAR_WHITES)
          : roll < 0.68
            ? pick(STAR_WHITES)
            : pick(STAR_BLUES);
        const b = bright ? 0.5 + rand() * 0.4 : 0.12 + rand() * 0.33;
        colors[i * 3] = c[0] * b;
        colors[i * 3 + 1] = c[1] * b;
        colors[i * 3 + 2] = c[2] * b;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      return g;
    };
    return { base: make(620, false), bright: make(90, true) };
  }, []);
  useEffect(
    () => () => {
      shells.base.dispose();
      shells.bright.dispose();
    },
    [shells],
  );
  useFrame(({ clock }) => {
    const m = brightMaterial.current;
    if (m) m.opacity = 0.72 + 0.14 * Math.sin(clock.elapsedTime * 0.45);
  });
  return (
    <group renderOrder={-1}>
      <points geometry={shells.base} frustumCulled={false}>
        <pointsMaterial
          size={1.5}
          sizeAttenuation={false}
          vertexColors
          transparent
          opacity={0.8}
          depthWrite={false}
          fog={false}
        />
      </points>
      <points geometry={shells.bright} frustumCulled={false}>
        <pointsMaterial
          ref={brightMaterial}
          size={2.5}
          sizeAttenuation={false}
          vertexColors
          transparent
          opacity={0.8}
          depthWrite={false}
          fog={false}
        />
      </points>
    </group>
  );
}

function World(props: SceneProps) {
  const {
    dataset,
    frame,
    land,
    variable,
    mode,
    range,
    opacity,
    exaggeration,
    grid,
    currents,
    density,
    observations,
    selected,
    onSelect,
    onInspect,
    preset,
    cameraKey,
    threshold,
  } = props;
  const p = projection(dataset);
  // Selected-observation anchor for 3D framing + the screen-space rail.
  const selectedObs = observations.find((o) => o.id === selected) ?? null;
  const focus = selectedObs
    ? { x: p.x(selectedObs.longitude), z: p.z(selectedObs.latitude) }
    : null;
  const regional =
    dataset.bounds.longitude[0] <= 45 &&
    dataset.bounds.longitude[1] >= 100 &&
    dataset.bounds.latitude[1] >= 28 &&
    dataset.bounds.latitude[0] <= -12;
  return (
    <>
      <color attach="background" args={['#020407']} />
      <fog attach="fog" args={['#020407', 35, 75]} />
      <BackdropStars />
      <ambientLight intensity={1.3} />
      <directionalLight position={[-7, 14, 5]} intensity={2} color="#b4d8ed" />
      <CameraRig
        preset={preset}
        cameraKey={cameraKey}
        dataset={dataset}
        exaggeration={exaggeration}
        focus={focus}
      />
      <Reference
        dataset={dataset}
        exaggeration={exaggeration}
        grid={grid}
        topDown={preset === 'surface'}
      />
      <Geography land={land} dataset={dataset} />
      {/* 3D-only faint curtains: the surface preset shows none. */}
      {mode !== 'iso' &&
        preset !== 'surface' &&
        (['south', 'east'] as const).map((edge) => (
          <SectionCurtain
            key={edge}
            edge={edge}
            dataset={dataset}
            field={frame.volume}
            variable={variable}
            range={range}
            opacity={opacity * 0.25}
            exaggeration={exaggeration}
          />
        ))}
      <Volume
        dataset={dataset}
        field={frame.volume}
        variable={variable}
        range={range}
        opacity={mode === 'volume' ? opacity * 0.7 : mode === 'iso' ? opacity : 0.095}
        exaggeration={exaggeration}
        mode={mode}
        threshold={threshold}
      />
      {(mode === 'slice' || mode === 'currents') && (
        <Slice
          dataset={dataset}
          field={frame.slice}
          variable={variable}
          range={range}
          opacity={mode === 'currents' ? opacity * 0.35 : opacity}
          exaggeration={exaggeration}
          onInspect={onInspect}
        />
      )}
      {currents && frame.currents && (
        <CurrentParticles
          field={frame.currents}
          dataset={dataset}
          exaggeration={exaggeration}
          density={density}
        />
      )}
      <Instruments
        observations={observations}
        dataset={dataset}
        selected={selected}
        onSelect={onSelect}
        exaggeration={exaggeration}
      />
      <DepthRail
        dataset={dataset}
        exaggeration={exaggeration}
        depth={frame.slice.depth ?? 0}
        anchor={focus ?? { x: 0, z: 0 }}
      />
      {regional && (
        <group>
          <Html position={[p.x(78.5), 0.2, p.z(22.5)]} center>
            <span className="region-label">I N D I A</span>
          </Html>
          <Html position={[p.x(63), 0.15, p.z(5)]} center>
            <span className="sea-label">ARABIAN SEA</span>
          </Html>
          <Html position={[p.x(88), 0.15, p.z(17)]} center>
            <span className="sea-label">BAY OF BENGAL</span>
          </Html>
          <Html position={[p.x(82), 0.15, p.z(-8)]} center>
            <span className="sea-label large">INDIAN OCEAN</span>
          </Html>
        </group>
      )}
    </>
  );
}

export default function OceanScene(props: SceneProps) {
  return (
    <Canvas
      // Near-frontal start so the first frame already reads north-up; the
      // rig then glides to the fitted composition.
      camera={{ position: [3, 12, 24], fov: 43, near: 0.1, far: 120 }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      fallback={
        <div className="error-screen">
          WebGL is unavailable. Enable browser hardware acceleration and restart the viewer.
        </div>
      }
    >
      <Suspense fallback={null}>
        <World {...props} />
      </Suspense>
    </Canvas>
  );
}
