import { useEffect, useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { Dataset, Field, Mode, Variable } from '../types';
import { projection, depthY } from './coordinates';
import { dataColor } from './colors';

interface Props {
  dataset: Dataset;
  field: Field;
  variable: Variable;
  range: [number, number];
  opacity: number;
  exaggeration: number;
}
// South boundary section uses the actual depth-resolved model cells, not decorative bathymetry.
export function SectionCurtain({
  dataset,
  field,
  variable,
  range,
  opacity,
  exaggeration,
  edge = 'south',
}: Props & { edge?: 'south' | 'east' }) {
  const geometry = useMemo(() => {
    const p = projection(dataset),
      layers = field.values as (number | null)[][][];
    const nx = edge === 'south' ? field.longitudes.length : field.latitudes.length,
      positions: number[] = [],
      colors: number[] = [],
      indices: number[] = [];
    const color = new THREE.Color();
    const rows = layers.map((layer) =>
      edge === 'south' ? layer[0] : layer.map((row) => row[row.length - 1]),
    );
    rows.forEach((row, k) =>
      row.forEach((value, i) => {
        positions.push(
          p.x(
            edge === 'south' ? field.longitudes[i] : field.longitudes[field.longitudes.length - 1],
          ),
          depthY(field.depths[k], exaggeration),
          p.z(edge === 'south' ? field.latitudes[0] : field.latitudes[i]),
        );
        dataColor(value ?? range[0], variable, ...range, color);
        colors.push(color.r, color.g, color.b);
        if (
          k < layers.length - 1 &&
          i < nx - 1 &&
          [value, row[i + 1], rows[k + 1][i], rows[k + 1][i + 1]].every((v) => v !== null)
        ) {
          const a = k * nx + i;
          indices.push(a, a + 1, a + nx, a + 1, a + nx + 1, a + nx);
        }
      }),
    );
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    return geo;
  }, [dataset, field, variable, range, exaggeration, edge]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial
        vertexColors
        side={THREE.DoubleSide}
        transparent
        depthWrite={false}
        opacity={opacity}
      />
    </mesh>
  );
}
export function Slice({
  dataset,
  field,
  variable,
  range,
  opacity,
  exaggeration,
  onInspect,
}: Props & { onInspect: (lat: number, lon: number) => void }) {
  const group = useRef<THREE.Group>(null);
  const geo = useMemo(() => {
    const project = projection(dataset),
      rows = field.values as (number | null)[][];
    const nx = field.longitudes.length,
      nz = field.latitudes.length;
    const positions = new Float32Array(nx * nz * 3),
      colors = new Float32Array(nx * nz * 3),
      indices: number[] = [];
    const color = new THREE.Color();
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        const k = (j * nx + i) * 3;
        positions[k] = project.x(field.longitudes[i]);
        positions[k + 2] = project.z(field.latitudes[j]);
        dataColor(rows[j][i] ?? range[0], variable, ...range, color).toArray(colors, k);
        if (
          i < nx - 1 &&
          j < nz - 1 &&
          [rows[j][i], rows[j][i + 1], rows[j + 1][i], rows[j + 1][i + 1]].every((v) => v !== null)
        ) {
          const a = j * nx + i;
          indices.push(a, a + nx, a + 1, a + 1, a + nx, a + nx + 1);
        }
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  }, [dataset, field, variable, range]);
  useEffect(() => () => geo.dispose(), [geo]);
  useFrame((_, dt) => {
    if (group.current)
      group.current.position.y = THREE.MathUtils.damp(
        group.current.position.y,
        depthY(field.depth ?? 0, exaggeration),
        7,
        dt,
      );
  });
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 5) return;
    const p = projection(dataset);
    onInspect(p.lat(e.point.z), p.lon(e.point.x));
  };
  return (
    <group ref={group}>
      <mesh geometry={geo} onClick={click}>
        <meshBasicMaterial
          vertexColors
          side={THREE.DoubleSide}
          transparent
          opacity={opacity}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

export function Volume({
  dataset,
  field,
  variable,
  range,
  opacity,
  exaggeration,
  mode,
  threshold,
}: Props & { mode: Mode; threshold: number }) {
  const geo = useMemo(() => {
    const project = projection(dataset),
      layers = field.values as (number | null)[][][];
    const positions: number[] = [],
      colors: number[] = [];
    const color = new THREE.Color();
    const tolerance = (range[1] - range[0]) * 0.025;
    layers.forEach((layer, k) =>
      layer.forEach((row, j) =>
        row.forEach((value, i) => {
          if (value === null || (mode === 'iso' && Math.abs(value - threshold) > tolerance)) return;
          positions.push(
            project.x(field.longitudes[i]),
            depthY(field.depths[k], exaggeration),
            project.z(field.latitudes[j]),
          );
          dataColor(value, variable, ...range, color);
          colors.push(color.r, color.g, color.b);
        }),
      ),
    );
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return g;
  }, [dataset, field, variable, range, exaggeration, mode, threshold]);
  useEffect(() => () => geo.dispose(), [geo]);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        vertexColors: true,
        uniforms: {
          alpha: { value: opacity },
          size: { value: mode === 'iso' ? 7.5 : mode === 'volume' ? 5.0 : 2.4 },
        },
        vertexShader: `varying vec3 vColor; uniform float size; void main(){vColor=color; vec4 mv=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mv;gl_PointSize=size*(22.0/-mv.z);}`,
        fragmentShader: `varying vec3 vColor; uniform float alpha; void main(){float r=length(gl_PointCoord-vec2(.5));if(r>.5)discard; gl_FragColor=vec4(vColor,alpha*smoothstep(.5,.15,r));\n #include <tonemapping_fragment>\n #include <colorspace_fragment>\n}`,
      }),
    [mode],
  );
  useEffect(() => () => material.dispose(), [material]);
  material.uniforms.alpha.value = opacity;
  return <points geometry={geo} material={material} frustumCulled={false} />;
}
