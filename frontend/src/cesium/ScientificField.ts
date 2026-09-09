import { Color } from 'three';
import { dataColor } from '../ocean/colors';
import type { Variable } from '../types';
import { interpolate, interval } from './gridSampling';
export interface PaintOptions {
  variable: Variable;
  min: number;
  max: number;
  opacity: number;
  isoThreshold?: number | null;
  isoTolerance?: number;
  fadeEdge?: boolean;
  latitudes?: number[];
  longitudes?: number[];
}
function paint(
  canvas: HTMLCanvasElement,
  rows: (number | null)[][],
  latitudes: number[],
  longitudes: number[],
  opts: PaintOptions,
  global: boolean,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx || !rows.length || !rows[0]?.length) return;
  const { width: w, height: h } = canvas;
  const img = ctx.createImageData(w, h),
    color = new Color();
  // Feather only the opacity inside valid coastal cells. Never invent values
  // over missing cells to disguise the coarse model's coastline.
  const coverage = rows.map((row, j) =>
    row.map((value, i) => {
      if (value === null) return 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const jj = j + dy,
            ii = global ? (i + dx + row.length) % row.length : i + dx;
          if (jj >= 0 && jj < rows.length && ii >= 0 && ii < row.length && rows[jj][ii] === null)
            return 0;
        }
      return 1;
    }),
  );
  const west = global ? -180 : longitudes[0],
    east = global ? 180 : longitudes.at(-1)!;
  const south = global ? -90 : latitudes[0],
    north = global ? 90 : latitudes.at(-1)!;
  const xs = Array.from({ length: w }, (_, x) =>
    interval(longitudes, west + (x / Math.max(1, w - 1)) * (east - west), global),
  );
  const ys = Array.from({ length: h }, (_, y) =>
    interval(latitudes, north - (y / Math.max(1, h - 1)) * (north - south)),
  );
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const value = interpolate(rows, xs[x], ys[y]);
      if (value === null) continue;
      if (
        opts.isoThreshold != null &&
        Math.abs(value - opts.isoThreshold) > (opts.isoTolerance ?? 0)
      )
        continue;
      dataColor(value, opts.variable, opts.min, opts.max, color);
      color.convertLinearToSRGB();
      const offset = (y * w + x) * 4;
      img.data[offset] = Math.round(color.r * 255);
      img.data[offset + 1] = Math.round(color.g * 255);
      img.data[offset + 2] = Math.round(color.b * 255);
      img.data[offset + 3] = Math.round(
        opts.opacity * (interpolate(coverage, xs[x], ys[y]) ?? 0) * 255,
      );
    }
  ctx.putImageData(img, 0, 0);
}
/** Regional rectangle; null samples remain transparent. */
export function paintContinuousField(
  canvas: HTMLCanvasElement,
  rows: (number | null)[][],
  opts: PaintOptions,
): void {
  paint(
    canvas,
    rows,
    opts.latitudes ?? rows.map((_, i) => i),
    opts.longitudes ?? rows[0].map((_, i) => i),
    opts,
    false,
  );
}
/** Full equirectangular globe with an explicitly periodic longitude seam. */
export function paintGlobalOcean(
  canvas: HTMLCanvasElement,
  rows: (number | null)[][],
  latitudes: number[],
  longitudes: number[],
  opts: PaintOptions,
): void {
  paint(canvas, rows, latitudes, longitudes, opts, true);
}
