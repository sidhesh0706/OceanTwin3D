/** Coordinate-aware interpolation for nonuniform and downsampled grids. */
export function interval(
  axis: number[],
  value: number,
  periodic = false,
): [number, number, number] | null {
  const n = axis.length;
  if (n < 2 || !Number.isFinite(value)) return null;
  if (periodic) value = ((((value - axis[0]) % 360) + 360) % 360) + axis[0];
  if (value < axis[0] || (!periodic && value > axis[n - 1])) return null;
  if (value > axis[n - 1]) return [n - 1, 0, (value - axis[n - 1]) / (axis[0] + 360 - axis[n - 1])];
  let lo = 0,
    hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (axis[mid] > value) hi = mid;
    else lo = mid;
  }
  return [lo, hi, (value - axis[lo]) / (axis[hi] - axis[lo])];
}
export function interpolate(
  rows: (number | null)[][],
  x: ReturnType<typeof interval>,
  y: ReturnType<typeof interval>,
): number | null {
  if (!x || !y) return null;
  const [i, ii, tx] = x,
    [j, jj, ty] = y;
  const samples = [rows[j][i], rows[j][ii], rows[jj][i], rows[jj][ii]];
  const weights = [(1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty];
  let value = 0;
  for (let k = 0; k < 4; k++) {
    if (weights[k] < 1e-12) continue;
    if (samples[k] === null || !Number.isFinite(samples[k])) return null;
    value += samples[k]! * weights[k];
  }
  return value;
}
