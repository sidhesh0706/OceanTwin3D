// Dense continuous scientific field renderer.
//
// Takes the backend model grid (lat × lon, null = land/missing) and paints
// a HIGH-RESOLUTION canvas via scientifically valid bilinear interpolation
// between real samples. No noise, no fake eddies, no invented structure:
// smooth gradients come from the data itself.
//
// Land masking is strict: a high-res pixel is painted only when its four
// surrounding model cells are all wet. Coastal pixels fall back to the
// nearest wet sample at reduced alpha. The edge of the dataset domain
// FADES TO ZERO so no rectangular border is ever visible.
import { Color } from 'three';
import { dataColor } from '../ocean/colors';
import type { Variable } from '../types';

const scratch = new Color();

function isCoastal(
  rows: (number | null)[][],
  j: number,
  i: number,
  nz: number,
  nx: number,
): boolean {
  return (
    (i > 0 && rows[j][i - 1] === null) ||
    (i < nx - 1 && rows[j][i + 1] === null) ||
    (j > 0 && rows[j - 1][i] === null) ||
    (j < nz - 1 && rows[j + 1][i] === null)
  );
}

// Bilinear sample of the coarse grid at fractional (gy, gx).
// Returns null when any of the 4 corners is land/missing.
function bilinear(
  rows: (number | null)[][],
  gy: number,
  gx: number,
  nz: number,
  nx: number,
): number | null {
  const j0 = Math.floor(gy);
  const i0 = Math.floor(gx);
  const j1 = Math.min(nz - 1, j0 + 1);
  const i1 = Math.min(nx - 1, i0 + 1);
  const a = rows[j0][i0];
  const b = rows[j0][i1];
  const c = rows[j1][i0];
  const d = rows[j1][i1];
  if (a === null || b === null || c === null || d === null) return null;
  const ty = gy - j0;
  const tx = gx - i0;
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}

function nearestWet(
  rows: (number | null)[][],
  gy: number,
  gx: number,
  nz: number,
  nx: number,
): { value: number; j: number; i: number } | null {
  const j0 = Math.max(0, Math.min(nz - 1, Math.round(gy)));
  const i0 = Math.max(0, Math.min(nx - 1, Math.round(gx)));
  if (rows[j0][i0] !== null) return { value: rows[j0][i0] as number, j: j0, i: i0 };
  for (let r = 1; r <= 2; r++) {
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(dj), Math.abs(di)) !== r) continue;
        const j = j0 + dj;
        const i = i0 + di;
        if (j < 0 || i < 0 || j >= nz || i >= nx) continue;
        const v = rows[j][i];
        if (v !== null) return { value: v, j, i };
      }
    }
  }
  return null;
}

export interface PaintOptions {
  variable: Variable;
  min: number;
  max: number;
  opacity: number;
  // Iso preview: only paint samples within tolerance of threshold.
  isoThreshold?: number | null;
  isoTolerance?: number;
  // When true, domain boundary fades completely to 0 (no rectangular edge).
  // Set false only for thumbnail/colorbar contexts where a clipped rect is fine.
  fadeEdge?: boolean;
}

/**
 * Paint a dense continuous field into `canvas` (sized by caller).
 * Canvas top row = northernmost latitude.
 *
 * Key behaviour: the domain boundary fades to alpha=0 so no rectangular
 * outline is ever visible — the scientific field dissolves into the ocean.
 */
export function paintContinuousField(
  canvas: HTMLCanvasElement,
  rows: (number | null)[][],
  opts: PaintOptions,
): void {
  const nz = rows.length;
  const nx = rows[0]?.length ?? 0;
  if (!nz || !nx) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;
  const img = ctx.createImageData(W, H);
  const px = img.data;
  const { variable, min, max, opacity, fadeEdge = true } = opts;
  const isoOn = opts.isoThreshold !== null && opts.isoThreshold !== undefined;
  const tol = opts.isoTolerance ?? 0;

  // Count wet cells to determine if this is a global dataset (most cells wet).
  // For global data there is no meaningful "domain edge" so edge fade is lighter.
  let wetCount = 0;
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++)
      if (rows[j][i] !== null) wetCount++;
  const wetFraction = wetCount / (nz * nx);
  // Global ocean: ~65% wet. For global data, reduce edge fade width to avoid
  // painting too much transition onto the polar ice caps.
  const edgeFadeWidth = wetFraction > 0.5 ? 1.2 : 3.5;

  for (let y = 0; y < H; y++) {
    // Canvas y=0 is north; grid j=0 is south → flip.
    const gy = ((H - 1 - y) / Math.max(1, H - 1)) * (nz - 1);
    for (let x = 0; x < W; x++) {
      const gx = (x / Math.max(1, W - 1)) * (nx - 1);
      let value = bilinear(rows, gy, gx, nz, nx);
      let coastal = false;
      if (value === null) {
        const near = nearestWet(rows, gy, gx, nz, nx);
        if (!near) continue;
        value = near.value;
        coastal = true;
        // Only a one-cell coastal fringe — never bleed far over land.
        const dj = Math.abs(near.j - gy);
        const di = Math.abs(near.i - gx);
        if (dj > 1.1 || di > 1.1) continue;
      } else {
        const j0 = Math.max(0, Math.min(nz - 1, Math.round(gy)));
        const i0 = Math.max(0, Math.min(nx - 1, Math.round(gx)));
        coastal = isCoastal(rows, j0, i0, nz, nx);
      }
      if (isoOn && Math.abs((value as number) - (opts.isoThreshold as number)) > tol) continue;

      // Feather domain border: alpha ramps from 0 at the grid edge to full
      // opacity inside. The gradient goes all the way to 0 so the rectangular
      // data boundary is never visible — it dissolves into the globe.
      let alpha = opacity;
      if (fadeEdge) {
        const edgeGx = Math.min(gx, nx - 1 - gx);
        const edgeGy = Math.min(gy, nz - 1 - gy);
        const edge = Math.min(edgeGx, edgeGy);
        // Deterministic dither breaks up the fade into a soft, organic edge.
        const hash = ((x * 73856093) ^ (y * 19349663)) >>> 0;
        const dither = (hash % 100) / 100 - 0.5;
        const t = Math.min(1, (edge + 0.5 + dither * 0.6) / edgeFadeWidth);
        alpha = opacity * t;
        // No minimum clamp: the edge is allowed to reach 0, eliminating the
        // rectangular border that was visible when alpha was clamped at 55%.
      }
      if (coastal) alpha *= 0.45;
      if (alpha <= 0.015) continue;

      dataColor(value as number, variable, min, max, scratch);
      const o = (y * W + x) * 4;
      px[o] = Math.round(scratch.r * 255);
      px[o + 1] = Math.round(scratch.g * 255);
      px[o + 2] = Math.round(scratch.b * 255);
      px[o + 3] = Math.round(alpha * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * Paint a full 360° global ocean equirectangular field covering [-180, -90, 180, 90].
 * Canvas width W and height H (typically 1024x512).
 * Longitude wraps seamlessly across the 180° antimeridian.
 * Land cells are completely transparent (alpha = 0).
 * Ocean cells are painted with high-quality continuous scientific colormap.
 */
export function paintGlobalOcean(
  canvas: HTMLCanvasElement,
  rows: (number | null)[][],
  latitudes: number[],
  longitudes: number[],
  opts: PaintOptions,
): void {
  const nz = rows.length;
  const nx = rows[0]?.length ?? 0;
  if (!nz || !nx) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;
  const img = ctx.createImageData(W, H);
  const px = img.data;
  const { variable, min, max, opacity } = opts;
  const isoOn = opts.isoThreshold !== null && opts.isoThreshold !== undefined;
  const tol = opts.isoTolerance ?? 0;

  const latMin = latitudes[0];
  const latMax = latitudes[nz - 1];
  const latSpan = Math.max(1e-5, latMax - latMin);
  const lonMin = longitudes[0];
  const lonMax = longitudes[nx - 1];
  const lonSpan = Math.max(1e-5, lonMax - lonMin);
  const dLon = lonSpan / (nx - 1);

  const gys = new Float32Array(H);
  for (let y = 0; y < H; y++) {
    const lat = 90 - (y / Math.max(1, H - 1)) * 180;
    if (lat < latMin || lat > latMax) {
      gys[y] = -999;
    } else {
      gys[y] = ((lat - latMin) / latSpan) * (nz - 1);
    }
  }

  const gxs = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    const lon = -180 + (x / Math.max(1, W - 1)) * 360;
    let relLon = (lon - lonMin) % 360;
    if (relLon < 0) relLon += 360;
    gxs[x] = relLon / dLon;
  }

  const alphaMax = Math.round(opacity * 255);

  for (let y = 0; y < H; y++) {
    const gy = gys[y];
    if (gy < 0) continue;
    const j0 = Math.floor(gy);
    const j1 = Math.min(nz - 1, j0 + 1);
    const ty = gy - j0;
    const row0 = rows[j0];
    const row1 = rows[j1];
    const yOffset = y * W * 4;

    for (let x = 0; x < W; x++) {
      const gx = gxs[x];
      const i0 = Math.floor(gx) % nx;
      const i1 = (i0 + 1) % nx;
      const tx = gx - Math.floor(gx);

      const v00 = row0[i0];
      const v01 = row0[i1];
      const v10 = row1[i0];
      const v11 = row1[i1];

      if (v00 === null && v01 === null && v10 === null && v11 === null) {
        continue;
      }

      let sumVal = 0;
      let sumWeight = 0;
      const w00 = (1 - tx) * (1 - ty);
      const w01 = tx * (1 - ty);
      const w10 = (1 - tx) * ty;
      const w11 = tx * ty;

      if (v00 !== null) { sumVal += v00 * w00; sumWeight += w00; }
      if (v01 !== null) { sumVal += v01 * w01; sumWeight += w01; }
      if (v10 !== null) { sumVal += v10 * w10; sumWeight += w10; }
      if (v11 !== null) { sumVal += v11 * w11; sumWeight += w11; }

      if (sumWeight < 0.25) continue;

      const val = sumVal / sumWeight;
      if (isoOn && Math.abs(val - opts.isoThreshold!) > tol) continue;

      dataColor(val, variable, min, max, scratch);
      const o = yOffset + x * 4;
      px[o] = Math.round(scratch.r * 255);
      px[o + 1] = Math.round(scratch.g * 255);
      px[o + 2] = Math.round(scratch.b * 255);
      const a = sumWeight < 0.8 ? Math.round(alphaMax * (sumWeight / 0.8)) : alphaMax;
      px[o + 3] = a;
    }
  }
  ctx.putImageData(img, 0, 0);
}
