import { Color } from 'three';
import { dataColor } from '../ocean/colors';
import { landMask, extendCoastalDisplay, geographicLandTest } from '../ocean/coastalDisplay';
import type { Variable, Land } from '../types';
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
  land?: Land | null;
  oceanBackground?: boolean;
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
  const west = global ? -180 : longitudes[0],
    east = global ? 180 : longitudes.at(-1)!;
  const south = global ? -90 : latitudes[0],
    north = global ? 90 : latitudes.at(-1)!;
  const mask = landMask(opts.land, w, h, west, east, south, north);
  const isLand = geographicLandTest(opts.land);
  const display = extendCoastalDisplay(rows, (j, i) => isLand(longitudes[i], latitudes[j]), global);
  const xs = Array.from({ length: w }, (_, x) =>
    interval(longitudes, west + (x / (w - 1)) * (east - west), global),
  );
  const ys = Array.from({ length: h }, (_, y) =>
    interval(latitudes, north - (y / (h - 1)) * (north - south)),
  );
  const img = ctx.createImageData(w, h),
    color = new Color();
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const offset = (y * w + x) * 4,
        wet = 1 - mask[offset + 3] / 255;
      if (!wet) continue;
      const value = interpolate(display, xs[x], ys[y]);
      if (value === null) {
        if (opts.oceanBackground) {
          img.data.set([13, 42, 60, Math.round(255 * wet * opts.opacity)], offset);
        }
        continue;
      }
      if (
        opts.isoThreshold != null &&
        Math.abs(value - opts.isoThreshold) > (opts.isoTolerance ?? 0)
      )
        continue;
      dataColor(value, opts.variable, opts.min, opts.max, color).convertLinearToSRGB();
      img.data.set(
        [
          Math.round(color.r * 255),
          Math.round(color.g * 255),
          Math.round(color.b * 255),
          Math.round(opts.opacity * wet * 255),
        ],
        offset,
      );
    }
  ctx.putImageData(img, 0, 0);
}
export function paintContinuousField(
  canvas: HTMLCanvasElement,
  rows: (number | null)[][],
  opts: PaintOptions,
) {
  paint(
    canvas,
    rows,
    opts.latitudes ?? rows.map((_, i) => i),
    opts.longitudes ?? rows[0].map((_, i) => i),
    opts,
    false,
  );
}
export function paintGlobalOcean(
  canvas: HTMLCanvasElement,
  rows: (number | null)[][],
  latitudes: number[],
  longitudes: number[],
  opts: PaintOptions,
) {
  paint(canvas, rows, latitudes, longitudes, opts, true);
}
