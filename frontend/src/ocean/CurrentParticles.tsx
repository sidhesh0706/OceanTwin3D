import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Currents, Dataset } from '../types';
import { depthY, projection } from './coordinates';

function interval(axis: number[], v: number) {
  let lo = 0,
    hi = axis.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (axis[mid] > v) hi = mid;
    else lo = mid;
  }
  return lo;
}
// Bilinear u/v sampling; land and missing-data cells respawn instead of crossing land.
export function sample(field: Currents, lon: number, lat: number): [number, number] | null {
  const xs = field.longitudes,
    ys = field.latitudes;
  if (lon < xs[0] || lon > xs[xs.length - 1] || lat < ys[0] || lat > ys[ys.length - 1]) return null;
  const i = interval(xs, lon),
    j = interval(ys, lat),
    tx = (lon - xs[i]) / (xs[i + 1] - xs[i]),
    ty = (lat - ys[j]) / (ys[j + 1] - ys[j]);
  const interpolate = (a: (number | null)[][]) => {
    const values = [a[j][i], a[j][i + 1], a[j + 1][i], a[j + 1][i + 1]];
    if (values.some((v) => v === null)) return null;
    const [p, q, r, s] = values as number[];
    return (p * (1 - tx) + q * tx) * (1 - ty) + (r * (1 - tx) + s * tx) * ty;
  };
  const u = interpolate(field.u),
    v = interpolate(field.v);
  return u === null || v === null ? null : [u, v];
}

export function CurrentParticles({
  field,
  dataset,
  exaggeration,
  density,
}: {
  field: Currents;
  dataset: Dataset;
  exaggeration: number;
  density: number;
}) {
  const projectionInfo = useMemo(() => projection(dataset), [dataset]);
  const state = useMemo(() => {
    let seed = 41;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const wet: [number, number][] = [];
    field.u.forEach((row, j) =>
      row.forEach((u, i) => {
        if (u !== null && sample(field, field.longitudes[i], field.latitudes[j]))
          wet.push([field.longitudes[i], field.latitudes[j]]);
      }),
    );
    const particles = Array.from({ length: wet.length ? density : 0 }, () => {
      const [lon, lat] = wet[Math.floor(rand() * wet.length)] ?? [0, 0];
      return { lon, lat, age: rand() * 10, life: 5 + rand() * 9 };
    });
    const positions = new Float32Array(particles.length * 6),
      colors = new Float32Array(particles.length * 6);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage),
    );
    geometry.setAttribute(
      'color',
      new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage),
    );
    return { particles, wet, geometry, positions, colors, rand };
  }, [field, density]);
  useEffect(() => () => state.geometry.dispose(), [state]);
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05),
      y = depthY(field.depth, exaggeration) + 0.035;
    state.particles.forEach((p, k) => {
      p.age += dt;
      let velocity = sample(field, p.lon, p.lat);
      if (!velocity || p.age > p.life) {
        const pos = state.wet[Math.floor(state.rand() * state.wet.length)];
        p.lon = pos[0];
        p.lat = pos[1];
        p.age = 0;
        velocity = sample(field, p.lon, p.lat);
      }
      const [u, v] = velocity ?? [0, 0];
      // 250,000× time acceleration for legibility, latitude-corrected eastward velocity.
      const dl = (u * 250000) / 111320 / Math.max(0.2, Math.cos((p.lat * Math.PI) / 180)),
        da = (v * 250000) / 111320;
      p.lon += dl * dt;
      p.lat += da * dt;
      const x = projectionInfo.x(p.lon),
        z = projectionInfo.z(p.lat),
        base = k * 6;
      state.positions.set(
        [x, y, z, x - dl * projectionInfo.scale * 0.28, y, z + da * projectionInfo.scale * 0.28],
        base,
      );
      const fade = Math.min(1, p.age / 0.6, (p.life - p.age) / 0.6),
        s = Math.max(0, fade);
      state.colors.set([0.55 * s, 0.92 * s, 1 * s, 0.05 * s, 0.2 * s, 0.3 * s], base);
    });
    state.geometry.attributes.position.needsUpdate = true;
    state.geometry.attributes.color.needsUpdate = true;
  });
  return (
    <lineSegments geometry={state.geometry} frustumCulled={false}>
      <lineBasicMaterial
        vertexColors
        transparent
        opacity={0.85}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </lineSegments>
  );
}
