import { getCesium } from './cesiumTypes';

// Pinned CesiumJS release loaded on demand and shared by every Cesium
// surface (cinematic landing, explorer globe). The scientific bundles never
// include Cesium; the engine script is fetched once and reused.
export const CESIUM_VERSION = '1.128.0';
export const CESIUM_BASE = '/vendor/cesium/';
const CESIUM_JS = `${CESIUM_BASE}Cesium.js`;
const CESIUM_CSS = `${CESIUM_BASE}Widgets/widgets.css`;

let pending: Promise<void> | null = null;

export function loadCesium(): Promise<void> {
  if (getCesium()) return Promise.resolve();
  if (pending) return pending;
  (window as unknown as { CESIUM_BASE_URL: string }).CESIUM_BASE_URL = CESIUM_BASE;
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
    const fail = () => {
      window.clearTimeout(timeout);
      script.remove();
      pending = null;
      reject(new Error('Could not load the local globe engine. Run the project setup and reload.'));
    };
    const timeout = window.setTimeout(fail, 20000);
    script.onload = () => {
      window.clearTimeout(timeout);
      if (getCesium()) resolve();
      else fail();
    };
    script.onerror = fail;
    document.head.appendChild(script);
  });
  return pending;
}
