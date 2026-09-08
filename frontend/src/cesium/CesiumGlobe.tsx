import { useEffect, useRef } from 'react';
import { getCesium, type CesiumViewer } from './cesiumTypes';
import { loadCesium as loadScript } from './loadCesium';

interface Props {
  onViewer: (viewer: CesiumViewer | null) => void;
  onFailure: (message: string) => void;
}

// Owns exactly one persistent Cesium Viewer for the landing sequence.
// Created once on mount, destroyed on unmount; never recreated on render.
export default function CesiumGlobe({ onViewer, onFailure }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onViewer, onFailure });
  callbacks.current = { onViewer, onFailure };

  useEffect(() => {
    let cancelled = false;
    let viewer: CesiumViewer | null = null;
    void loadScript()
      .then(() => {
        if (cancelled || !host.current) return;
        const Cesium = getCesium();
        if (!Cesium) throw new Error('Cesium failed to initialize.');
        viewer = new Cesium.Viewer(host.current, {
          animation: false,
          timeline: false,
          baseLayerPicker: false,
          geocoder: false,
          homeButton: false,
          sceneModePicker: false,
          navigationHelpButton: false,
          fullscreenButton: false,
          selectionIndicator: false,
          infoBox: false,
          shouldAnimate: true,
        });
        // Start from a clean slate: no default ion imagery (which needs a
        // token) and a plain ellipsoid. CesiumLayers adds the base back.
        try {
          viewer.imageryLayers.removeAll(false);
        } catch {
          /* Older engine builds keep their default layer; harmless. */
        }
        try {
          if (Cesium.EllipsoidTerrainProvider)
            viewer.scene.terrainProvider = new Cesium.EllipsoidTerrainProvider();
        } catch {
          /* Keep the engine default terrain on failure. */
        }
        try {
          viewer.scene.globe.baseColor = new Cesium.Color(0.024, 0.075, 0.12, 1);
          viewer.scene.globe.enableLighting = true;
          viewer.scene.skyAtmosphere.show = true;
        } catch {
          /* Cosmetic only. */
        }
        // Cinematic lock: scroll owns the camera. Every direct camera
        // input is disabled so wheel/drag/pinch can never fight the
        // choreography or accumulate drift. Page scroll is DOM-level and
        // unaffected. The explorer uses R3F controls, never this viewer.
        try {
          const lock = viewer.scene.screenSpaceCameraController;
          lock.enableZoom = false;
          lock.enableRotate = false;
          lock.enableTilt = false;
          lock.enableLook = false;
          lock.enableTranslate = false;
          lock.zoomEventTypes = [];
          // No residual drift: with inputs locked there must be no inertia
          // carrying the camera after scroll stops.
          lock.inertiaSpin = 0;
          lock.inertiaTranslate = 0;
          lock.inertiaZoom = 0;
        } catch {
          /* Engine keeps default input; canvas CSS still shields it. */
        }
        // Deterministic start: the exact orbit state owned by
        // LandingCameraController, so the sequence never inherits a
        // default camera position.
        try {
          viewer.camera.setView({
            destination: Cesium.Cartesian3.fromDegrees(60, 12, 28000000),
            orientation: {
              heading: Cesium.Math.toRadians(0),
              pitch: Cesium.Math.toRadians(-48),
              roll: 0,
            },
          });
        } catch {
          /* The opening flight will position the camera. */
        }
        callbacks.current.onViewer(viewer);
      })
      .catch((e: unknown) => {
        if (!cancelled)
          callbacks.current.onFailure(
            e instanceof Error ? e.message : 'Cinematic view unavailable.',
          );
      });
    return () => {
      cancelled = true;
      callbacks.current.onViewer(null);
      if (viewer && !viewer.isDestroyed()) {
        try {
          viewer.destroy();
        } catch {
          /* Engine teardown is best-effort. */
        }
      }
      viewer = null;
    };
  }, []);

  return <div ref={host} className="cesium-container" aria-hidden="true" />;
}
