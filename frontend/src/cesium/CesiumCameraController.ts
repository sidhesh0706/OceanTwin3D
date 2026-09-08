import { getCesium, type CesiumViewer } from './cesiumTypes';

export interface DirectView {
  longitude: number;
  latitude: number;
  height: number;
  heading: number;
  pitch: number;
  roll: number;
}

// Thin imperative wrapper around a single Cesium Viewer. The rAF loop owns
// the camera and writes one direct view per frame via setView — no flyTo
// flights, so rapid scroll reversals can never queue competing animations.
// React never owns camera objects; failed writes leave the HUD advancing.
export class CesiumCameraController {
  private viewer: CesiumViewer | null = null;

  attach(viewer: CesiumViewer | null) {
    this.viewer = viewer;
  }

  stop() {
    try {
      this.viewer?.camera.cancelFlight();
    } catch {
      /* No flight in progress. */
    }
  }

  setDirectView(view: DirectView) {
    const viewer = this.viewer;
    const Cesium = getCesium();
    if (!viewer || !Cesium) return;
    try {
      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(view.longitude, view.latitude, view.height),
        orientation: {
          heading: Cesium.Math.toRadians(view.heading),
          pitch: Cesium.Math.toRadians(view.pitch),
          roll: Cesium.Math.toRadians(view.roll),
        },
      });
    } catch {
      /* A failed write must not break the narrative; HUD still updates. */
    }
  }
}
