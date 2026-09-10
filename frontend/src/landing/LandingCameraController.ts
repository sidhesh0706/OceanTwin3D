import { CesiumCameraController } from '../cesium/CesiumCameraController';
import type { LandingScene } from '../experience/experienceState';

// Centralized cinematic choreography. The scroll track exposes ONE
// progress value (0 → 1); this module maps it to a continuous camera
// path, HUD scene and dive level. No per-scene flights, no competing
// animations — one owner, one interpolation.
export interface InterpolatedView {
  longitude: number;
  latitude: number;
  height: number;
  heading: number;
  pitch: number;
  roll: number;
}

interface Keyframe {
  p: number;
  view: InterpolatedView;
}

const KEYFRAMES: Keyframe[] = [
  {
    p: 0.0,
    view: { longitude: 60, latitude: 12, height: 28000000, heading: 0, pitch: -48, roll: 0 },
  },
  {
    p: 0.22,
    view: { longitude: 72, latitude: 16, height: 9000000, heading: 0, pitch: -58, roll: 0 },
  },
  {
    p: 0.4,
    view: { longitude: 70, latitude: 6, height: 700000, heading: 0, pitch: -75, roll: 0 },
  },
  {
    p: 0.52,
    view: { longitude: 70, latitude: 6, height: 350000, heading: 0, pitch: -82, roll: 0 },
  },
  { p: 0.72, view: { longitude: 70, latitude: 6, height: 42000, heading: 0, pitch: -85, roll: 0 } },
  {
    p: 0.84,
    view: { longitude: 72, latitude: 10, height: 2200000, heading: 0, pitch: -55, roll: 0 },
  },
  {
    p: 1.0,
    view: { longitude: 75, latitude: 15, height: 6000000, heading: 0, pitch: -55, roll: 0 },
  },
];

const DIVE_START = 0.4;
const DIVE_END = 0.72;

function smooth(t: number) {
  return t * t * (3 - 2 * t);
}

// Continuous camera path: linear angles, exponential altitude so a single
// scroll gesture moves proportionally at every scale.
export function viewForProgress(p: number): InterpolatedView {
  const clamped = Math.min(1, Math.max(0, p));
  let k = 0;
  while (k < KEYFRAMES.length - 2 && KEYFRAMES[k + 1].p <= clamped) k++;
  const a = KEYFRAMES[k];
  const b = KEYFRAMES[k + 1];
  const span = Math.max(1e-6, b.p - a.p);
  const t = smooth(Math.min(1, Math.max(0, (clamped - a.p) / span)));
  const lerp = (x: number, y: number) => x + (y - x) * t;
  return {
    longitude: lerp(a.view.longitude, b.view.longitude),
    latitude: lerp(a.view.latitude, b.view.latitude),
    height: Math.exp(lerp(Math.log(a.view.height), Math.log(b.view.height))),
    heading: lerp(a.view.heading, b.view.heading),
    pitch: lerp(a.view.pitch, b.view.pitch),
    roll: lerp(a.view.roll, b.view.roll),
  };
}

export function sceneForProgress(p: number): LandingScene {
  if (p < 0.22) return 'ocean';
  if (p < 0.52) return 'depth';
  if (p < 0.72) return 'time';
  if (p < 0.88) return 'observations';
  return 'explorer';
}

// Dive fraction across the real model levels — illustrative camera motion,
// real layer readout.
export function diveDepthForProgress(p: number, depths: number[]): number {
  if (!depths.length) return 0;
  const f = Math.min(1, Math.max(0, (p - DIVE_START) / (DIVE_END - DIVE_START)));
  return depths[Math.min(depths.length - 1, Math.floor(f * depths.length))];
}

export class LandingCameraController {
  private inner = new CesiumCameraController();
  reducedMotion = false;

  attach(viewer: Parameters<CesiumCameraController['attach']>[0]) {
    this.inner.attach(viewer);
  }

  stop() {
    this.inner.stop();
  }

  // Single per-frame camera write owned by the rAF loop. No flights, no
  // queue, nothing to compete with scroll.
  applyProgress(p: number) {
    this.inner.setDirectView(viewForProgress(p));
  }

  heightForScene(scene: LandingScene): number {
    switch (scene) {
      case 'ocean':
        return 16000000;
      case 'depth':
        return 350000;
      case 'time':
        return 1200000;
      case 'observations':
        return 2400000;
      case 'explorer':
        return 6000000;
    }
  }
}
