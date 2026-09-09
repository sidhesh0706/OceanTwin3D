// Central geographic authority for OceanTwin.
//
// Dataset: longitude / latitude / depth (metres, positive down)
//   ↓
// WGS84 geographic position
//   ↓
// Cesium Cartesian3
//
// All scientific layers (slice, volume, currents, observations, guides)
// MUST go through this module. Do not scatter lon/lat/depth math across
// React components.
import type { Dataset } from '../types';
import { getCesium } from './cesiumTypes';

// ── LOD thresholds (camera height above ellipsoid, metres) ──────────────
//   > GLOBAL_KM    → global Earth, scientific overlays hidden
//   GLOBAL..REGIONAL → regional context, domain outline only
//   < REGIONAL_KM  → model domain, full scientific layers
export const GLOBAL_KM = 12_000_000;
export const REGIONAL_KM = 8_000_000;

// ── Required Cesium Ion assets (§5) ──────────────────────────────────────
// Photorealistic 3D Tiles are cinematic-only (landing). The explorer uses
// a single 2D satellite imagery layer + optional bathymetry terrain —
// never stacked tiles + imagery + terrain simultaneously.
export const ION_SATELLITE_2D = 3830182;
export const ION_WORLD_IMAGERY_FALLBACK = 2;
export const ION_BATHYMETRY = 2426648;
export const ION_PHOTOREALISTIC_TILES = 2275207;

// ── Schematic depth scale ────────────────────────────────────────────────
// Exaggerated so the 0–2000 m water column is visible at planetary scale.
// Surface data sits just above the ellipsoid (+2000 m); depth increases
// downward into the globe. Sign convention: depth positive down,
// height positive up (WGS84).
export function depthHeight(depth: number, exaggeration: number): number {
  if (depth <= 0) return 2000;
  return 2000 - depth * 100 * exaggeration;
}

// Camera height that places the viewer just above a given depth slice,
// so DIVE presets stay coupled to the selected model depth.
export function diveCameraHeight(depth: number, _exaggeration: number): number {
  if (depth <= 0) return 1_800_000;
  return Math.max(250_000, 1_800_000 - depth * 600);
}

// Longitude normalization: backend may store 0–360, Cesium wants -180–180.
export function normalizeLongitude(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

// True if a lon/lat sits inside the active model domain.
export function isInDomain(longitude: number, latitude: number, dataset: Dataset): boolean {
  const [south, north] = dataset.bounds.latitude;
  const [west, east] = dataset.bounds.longitude;
  const lon = normalizeLongitude(longitude);
  // For global datasets (>180° span), all ocean points are in domain.
  if (dataset.global) return latitude >= south && latitude <= north;
  return lon >= west && lon <= east && latitude >= south && latitude <= north;
}

// Dataset domain extents (never invented — always from backend metadata).
export function domainExtents(dataset: Dataset): {
  west: number;
  south: number;
  east: number;
  north: number;
  centerLon: number;
  centerLat: number;
} {
  const [south, north] = dataset.bounds.latitude;
  const [west, east] = dataset.bounds.longitude;
  const centerLon = dataset.global ? 0 : (west + east) / 2;
  const centerLat = (south + north) / 2;
  return { west, south, east, north, centerLon, centerLat };
}

// Single choke point for lon/lat/depth → Cartesian3.
export function cartesianFromLonLatDepth(
  longitude: number,
  latitude: number,
  depth: number,
  exaggeration: number,
): unknown | null {
  const Cesium = getCesium();
  if (!Cesium) return null;
  try {
    return Cesium.Cartesian3.fromDegrees(
      normalizeLongitude(longitude),
      latitude,
      depthHeight(depth, exaggeration),
    );
  } catch {
    return null;
  }
}

// ── Ocean-basin camera presets ────────────────────────────────────────────
// lon, lat, altitude (m), pitch (degrees from horizontal, negative = looking down)
export const OCEAN_PRESETS: Record<string, { lon: number; lat: number; h: number; pitch: number }> =
  {
    global: { lon: 0, lat: 20, h: 20_000_000, pitch: -90 },
    approach: { lon: 0, lat: 20, h: 11_000_000, pitch: -75 },
    domain: { lon: 0, lat: 20, h: 5_500_000, pitch: -80 }, // overridden by domain center
    surface: { lon: 0, lat: 20, h: 1_800_000, pitch: -90 }, // overridden by domain center
    // Ocean basin overviews
    pacific: { lon: 175, lat: 0, h: 9_500_000, pitch: -90 },
    atlantic: { lon: -30, lat: 20, h: 9_500_000, pitch: -90 },
    indian: { lon: 75, lat: -10, h: 12_000_000, pitch: -90 },
    southern: { lon: 0, lat: -65, h: 8_000_000, pitch: -75 },
    arctic: { lon: 0, lat: 85, h: 6_000_000, pitch: -90 },
  };
