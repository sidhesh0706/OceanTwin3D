import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, Line, OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import type { CameraPreset, Dataset, Frame, Land, Mode, Observation, Variable } from '../types';
import { projection, depthY } from './coordinates';
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
  // Bundled geometry covers only the Indian Ocean region. Hide on other uploaded domains.
  const regional =
    dataset.bounds.longitude[0] === 45 &&
    dataset.bounds.longitude[1] === 100 &&
    dataset.bounds.latitude[0] === -12 &&
    dataset.bounds.latitude[1] === 28;
  if (!regional) return null;
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
  depth,
}: {
  dataset: Dataset;
  exaggeration: number;
  grid: boolean;
  depth: number;
}) {
  const p = projection(dataset),
    w = p.width / 2,
    h = p.height / 2,
    bottom = depthY(dataset.bounds.depth[1], exaggeration);
  const levels = [0, ...dataset.depths.filter((d) => d >= 100)];
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
          <Html position={[w + 0.42, depthY(d, exaggeration), h]} center>
            <div className={`depth-tick ${d === depth ? 'active' : ''}`}>
              {d === 0 ? 'SURFACE' : `${d.toLocaleString()} m`}
            </div>
          </Html>
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
        <span className="geo-coordinate">{dataset.bounds.longitude[0]}° E</span>
      </Html>
      <Html position={[w, 0, h + 0.35]} center>
        <span className="geo-coordinate">{dataset.bounds.longitude[1]}° E</span>
      </Html>
    </group>
  );
}

function CameraRig({ preset, cameraKey }: { preset: CameraPreset; cameraKey: number }) {
  const controls = useRef<OrbitControlsImpl>(null),
    moving = useRef(true);
  const { camera } = useThree();
  const target = useMemo(
    () => new THREE.Vector3(0, preset === 'underwater' ? -2 : -1.1, 0),
    [preset],
  );
  const position = useMemo(
    () =>
      new THREE.Vector3(
        ...((preset === 'surface'
          ? [0, 29, 0.1]
          : preset === 'underwater'
            ? [13, 1, 19]
            : [13, 14, 21]) as [number, number, number]),
      ),
    [preset],
  );
  useEffect(() => {
    moving.current = true;
  }, [preset, cameraKey]);
  useFrame((_, dt) => {
    if (!moving.current || !controls.current) return;
    camera.position.lerp(position, 1 - Math.exp(-dt * 4));
    controls.current.target.lerp(target, 1 - Math.exp(-dt * 4));
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
      maxDistance={52}
      maxPolarAngle={Math.PI * 0.86}
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
  const regional = dataset.synthetic;
  return (
    <>
      <color attach="background" args={['#08131e']} />
      <fog attach="fog" args={['#08131e', 35, 75]} />
      <ambientLight intensity={1.3} />
      <directionalLight position={[-7, 14, 5]} intensity={2} color="#b4d8ed" />
      <CameraRig preset={preset} cameraKey={cameraKey} />
      <Reference
        dataset={dataset}
        exaggeration={exaggeration}
        grid={grid}
        depth={frame.slice.depth ?? 0}
      />
      <Geography land={land} dataset={dataset} />
      {mode !== 'iso' && (
        <SectionCurtain
          dataset={dataset}
          field={frame.volume}
          variable={variable}
          range={range}
          opacity={opacity * 0.27}
          exaggeration={exaggeration}
        />
      )}
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
      camera={{ position: [13, 14, 21], fov: 43, near: 0.1, far: 120 }}
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
