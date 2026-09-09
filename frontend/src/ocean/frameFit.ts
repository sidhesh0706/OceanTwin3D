// Small pure helpers for the local 3D ocean analysis view.
// No THREE dependency.

export type Vec3 = [number, number, number];

/** Downward viewing angle (deg) and compass azimuth (deg) of a view dir. */
export function viewAngles(dir: Vec3): { elevationDeg: number; azimuthDeg: number } {
  const l = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  return {
    elevationDeg: (Math.asin(dir[1] / l) * 180) / Math.PI,
    azimuthDeg: (Math.atan2(dir[0], dir[2]) * 180) / Math.PI,
  };
}

/** Snap a computed exaggeration to the available control steps. */
export function snapExaggeration(value: number): number {
  const steps = [1, 2, 5, 10];
  let best = steps[0];
  for (const s of steps) {
    if (Math.abs(s - value) < Math.abs(best - value)) best = s;
  }
  return best;
}

/**
 * Sensible default exaggeration so the surface stays the hero while depth
 * reads as a subtle extension (~22% of footprint). User control wins after.
 */
export function defaultExaggeration(
  lonSpanDeg: number,
  latSpanDeg: number,
  maxDepthM: number,
): number {
  if (!(lonSpanDeg > 0) || !(maxDepthM > 0)) return 5;
  const scale = 18 / lonSpanDeg;
  const horiz = Math.max(18, latSpanDeg * scale);
  const unitPerEx = 0.00036 * maxDepthM;
  if (!(unitPerEx > 0)) return 5;
  const raw = (0.22 * horiz) / unitPerEx;
  return Math.min(10, Math.max(1, snapExaggeration(raw)));
}
