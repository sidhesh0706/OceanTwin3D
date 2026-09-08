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
    p: 0.12,
    view: { longitude: 70, latitude: 18, height: 16000000, heading: 0, pitch: -54, roll: 0 },
  },
  {
    p: 0.24,
    view: { longitude: 78, latitude: 22, height: 5500000, heading: 0, pitch: -60, roll: 0 },
  },
  {
    p: 0.36,
    view: { longitude: 73, latitude: 8, height: 3000000, heading: 0, pitch: -64, roll: 0 },
  },
  {
    p: 0.48,
    view: { longitude: 66, latitude: 12, height: 1600000, heading: 0, pitch: -70, roll: 0 },
  },
  {
    p: 0.58,
    view: { longitude: 70, latitude: 6, height: 700000, heading: 0, pitch: -75, roll: 0 },
  },
  {
    p: 0.62,
    view: { longitude: 70, latitude: 6, height: 350000, heading: 0, pitch: -82, roll: 0 },
  },
  { p: 0.84, view: { longitude: 70, latitude: 6, height: 42000, heading: 0, pitch: -85, roll: 0 } },
  {
    p: 0.88,
    view: { longitude: 72, latitude: 10, height: 2200000, heading: 0, pitch: -55, roll: 0 },
  },
  {
    p: 0.94,
    view: { longitude: 70, latitude: 12, height: 2800000, heading: 0, pitch: -50, roll: 0 },
  },
  {
    p: 1.0,
    view: { longitude: 75, latitude: 15, height: 6000000, heading: 0, pitch: -55, roll: 0 },
  },
];

const DIVE_START = 0.62;
const DIVE_END = 0.84;

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
  if (p < 0.06) return 'orbit';
  if (p < 0.18) return 'earth';
  if (p < 0.3) return 'india';
  if (p < 0.42) return 'indian-ocean';
  if (p < 0.53) return 'observations';
  if (p < 0.6) return 'surface';
  if (p < DIVE_END) return 'dive';
  if (p < 0.91) return 'ocean-field';
  if (p < 0.965) return 'comparison';
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
      case 'orbit':
        return 28000000;
      case 'earth':
        return 16000000;
      case 'india':
        return 5500000;
      case 'indian-ocean':
        return 3000000;
      case 'observations':
        return 1600000;
      case 'surface':
      case 'dive':
        return 350000;
      case 'ocean-field':
        return 2200000;
      case 'comparison':
        return 2800000;
      case 'explorer':
        return 6000000;
    }
  }
}
