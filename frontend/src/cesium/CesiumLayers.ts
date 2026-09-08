import { getCesium, type CesiumTileset, type CesiumViewer } from './cesiumTypes';

// Project Cesium ion asset configuration. Layers are added one at a time,
// never all simultaneously: each cinematic scene selects the single
// representation it needs.
export const ION_ASSETS = {
  photorealistic3DTiles: 2275207,
  satellite2D: 3830182,
  bathymetry: 2426648,
  sentinel2: 3954,
  fallbackTerrain: 1,
} as const;

export type CinematicBase = 'tiles' | 'osm' | 'none';

let tileset: unknown = null;
let analysisLayer: unknown = null;

function applyToken(token: string | null) {
  const Cesium = getCesium();
  if (Cesium && token) {
    try {
      Cesium.Ion.defaultAccessToken = token;
    } catch {
      /* Token assignment is best-effort. */
    }
  }
}

// Primary cinematic Earth layer: Google Photorealistic 3D Tiles. When it
// loads, the plain globe beneath is hidden to avoid a duplicate Earth.
export async function applyCinematicBase(
  viewer: CesiumViewer,
  token: string | null,
): Promise<CinematicBase> {
  applyToken(token);
  const Cesium = getCesium();
  if (Cesium?.Cesium3DTileset?.fromIonAssetId && token) {
    try {
      const set = await Cesium.Cesium3DTileset.fromIonAssetId(ION_ASSETS.photorealistic3DTiles);
      try {
        viewer.scene.globe.show = false;
      } catch {
        /* Cosmetic only. */
      }
      viewer.scene.primitives.add(set);
      tileset = set;
      tuneTilesetDetail(28000000);
      return 'tiles';
    } catch {
      tileset = null;
    }
  }
  if (Cesium?.OpenStreetMapImageryProvider) {
    try {
      viewer.imageryLayers.addImageryProvider(
        new Cesium.OpenStreetMapImageryProvider({ url: 'https://tile.openstreetmap.org/' }),
      );
      return 'osm';
    } catch {
      /* Fall through to the untextured globe. */
    }
  }
  return 'none';
}

// Optional satellite analysis layer (Google Maps 2D). Added only for the
// ocean-field scene and removed when leaving it.
export async function applyAnalysisImagery(
  viewer: CesiumViewer,
  token: string | null,
): Promise<boolean> {
  const Cesium = getCesium();
  if (!Cesium?.IonImageryProvider?.fromAssetId || !token || analysisLayer) return false;
  try {
    const provider = await Cesium.IonImageryProvider.fromAssetId(ION_ASSETS.satellite2D);
    viewer.imageryLayers.addImageryProvider(provider);
    analysisLayer = provider;
    return true;
  } catch {
    return false;
  }
}

export function removeAnalysisImagery(viewer: CesiumViewer) {
  if (!analysisLayer) return;
  try {
    viewer.imageryLayers.remove(analysisLayer, true);
  } catch {
    /* Best-effort cleanup. */
  }
  analysisLayer = null;
}

// Bathymetric context for the dive: Cesium World Bathymetry terrain.
// Token-gated; without a token the ellipsoid remains and the dive still
// reads through the depth HUD and darkening grade.
export async function applyBathymetry(
  viewer: CesiumViewer,
  token: string | null,
): Promise<boolean> {
  const Cesium = getCesium();
  if (!Cesium?.CesiumTerrainProvider?.fromIonAssetId || !Cesium.Terrain || !token) return false;
  try {
    const provider = await Cesium.CesiumTerrainProvider.fromIonAssetId(ION_ASSETS.bathymetry);
    if (viewer.scene.setTerrain) viewer.scene.setTerrain(new Cesium.Terrain(provider));
    else viewer.scene.terrainProvider = provider;
    return true;
  } catch {
    return false;
  }
}

export function restoreEllipsoidTerrain(viewer: CesiumViewer) {
  const Cesium = getCesium();
  try {
    if (Cesium?.EllipsoidTerrainProvider)
      viewer.scene.terrainProvider = new Cesium.EllipsoidTerrainProvider();
  } catch {
    /* Keep the current terrain on failure. */
  }
}

// LOD balance for the cinematic range: coarse tiles while far (fast),
// refined tiles near the surface. Driven by the active scene's camera
// height — never a permanently pinned screenshot-grade value.
export function tuneTilesetDetail(heightMetres: number) {
  const set = tileset as CesiumTileset | null;
  if (!set) return;
  try {
    set.maximumScreenSpaceError = heightMetres > 8000000 ? 32 : heightMetres > 2500000 ? 20 : 12;
    set.dynamicScreenSpaceError = true;
    set.foveatedScreenSpaceError = true;
  } catch {
    /* Keep engine defaults. */
  }
}

export function clearCinematicLayers(viewer: CesiumViewer) {
  removeAnalysisImagery(viewer);
  if (tileset) {
    try {
      viewer.scene.primitives.remove(tileset);
    } catch {
      /* Best-effort cleanup. */
    }
    tileset = null;
  }
  try {
    viewer.scene.globe.show = true;
  } catch {
    /* Cosmetic only. */
  }
  restoreEllipsoidTerrain(viewer);
}
