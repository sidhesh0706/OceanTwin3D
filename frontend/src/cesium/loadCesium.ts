import { getCesium } from './cesiumTypes';

// Pinned CesiumJS release loaded on demand and shared by every Cesium
// surface (cinematic landing, explorer globe). The scientific bundles never
// include Cesium; the engine script is fetched once and reused.
export const CESIUM_VERSION = '1.128';
const CESIUM_JS = `https://cesium.com/downloads/cesiumjs/releases/${CESIUM_VERSION}/Build/Cesium/Cesium.js`;
const CESIUM_CSS = `https://cesium.com/downloads/cesiumjs/releases/${CESIUM_VERSION}/Build/Cesium/Widgets/widgets.css`;

let pending: Promise<void> | null = null;

export function loadCesium(): Promise<void> {
  if (getCesium()) return Promise.resolve();
  if (pending) return pending;
  pending = new Promise<void>((resolve, reject) => {
    if (!document.querySelector(`link[data-cesium="${CESIUM_VERSION}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = CESIUM_CSS;
      link.dataset.cesium = CESIUM_VERSION;
      document.head.appendChild(link);
    }
    const script = document.createElement('script');
    script.src = CESIUM_JS;
    script.async = true;
    script.dataset.cesium = CESIUM_VERSION;
    script.onload = () =>
      getCesium() ? resolve() : reject(new Error('Cesium failed to initialize.'));
    script.onerror = () => {
      pending = null;
      reject(new Error('Could not load the Cesium engine. Check your network connection.'));
    };
    document.head.appendChild(script);
  });
  return pending;
}
