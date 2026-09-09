// Minimal structural typing for the CesiumJS global loaded lazily from
// CDN. Only the members this project uses are declared; everything the
// engine returns opaquely is `unknown` so strict mode stays satisfied
// without shipping the full Cesium type surface.
export interface CesiumCartographic {
  longitude: number;
  latitude: number;
  height: number;
}

export interface CesiumFlyToOptions {
  destination: unknown;
  orientation?: { heading: number; pitch: number; roll: number };
  duration?: number;
  easingFunction?: unknown;
  complete?: () => void;
  cancel?: () => void;
}

export interface CesiumCamera {
  flyTo(options: CesiumFlyToOptions): void;
  cancelFlight(): void;
  setView(options: { destination: unknown; orientation?: CesiumFlyToOptions['orientation'] }): void;
  pickEllipsoid(position: { x: number; y: number }): CesiumCartographic | null;
  readonly positionCartographic: CesiumCartographic;
  readonly moveEnd: CesiumCameraEvent;
}

export interface CesiumGlobeSurface {
  show: boolean;
  baseColor: unknown;
  enableLighting: boolean;
}

export interface CesiumEntityCollection {
  add(options: Record<string, unknown>): unknown;
  remove(entity: unknown): boolean;
  removeById(id: string): boolean;
  removeAll(): void;
}

export interface CesiumPicked {
  id?: { id?: string } & Record<string, unknown>;
}

export interface CesiumPointItem {
  position: unknown;
  color: unknown;
  pixelSize?: number;
}

export interface CesiumPointCollection {
  add(options: Record<string, unknown>): unknown;
  removeAll(): void;
  destroy(): void;
}

export interface CesiumLineCollection {
  add(options: Record<string, unknown>): void;
  removeAll(): void;
  show: boolean;
  destroy(): void;
}

export interface CesiumDataSourceHandle {
  entities: CesiumEntityCollection;
}

export interface CesiumInputHandler {
  setInputAction(
    action: (movement: { position: { x: number; y: number } }) => void,
    type: unknown,
  ): void;
  destroy(): void;
}

export interface CesiumCameraLock {
  enableZoom: boolean;
  enableRotate: boolean;
  enableTilt: boolean;
  enableLook: boolean;
  enableTranslate: boolean;
  enableCollisionDetection: boolean;
  zoomEventTypes: unknown[];
  inertiaSpin: number;
  inertiaTranslate: number;
  inertiaZoom: number;
}

export interface CesiumCameraEvent {
  addEventListener(listener: () => void): void;
  removeEventListener(listener: () => void): void;
}

export interface CesiumTileset {
  maximumScreenSpaceError: number;
  dynamicScreenSpaceError: boolean;
  foveatedScreenSpaceError: boolean;
}

export interface CesiumViewer {
  camera: CesiumCamera;
  canvas: HTMLCanvasElement;
  clock: { currentTime: unknown };
  entities: CesiumEntityCollection;
  dataSources: { add(source: unknown): void; remove(source: unknown): void };
  imageryLayers: {
    addImageryProvider(provider: unknown): unknown;
    remove(layer: unknown, destroy?: boolean): void;
    removeAll(destroy?: boolean): void;
    get(index: number): unknown;
    readonly length: number;
  };
  scene: {
    globe: CesiumGlobeSurface & {
      translucency: { enabled: boolean; frontFaceAlpha: number; backFaceAlpha?: number };
      depthTestAgainstTerrain?: boolean;
    };
    primitives: { add(primitive: unknown): void; remove(primitive: unknown): void };
    skyAtmosphere: { show: boolean };
    skyBox?: { show: boolean };
    terrainProvider: unknown;
    screenSpaceCameraController: CesiumCameraLock;
    setTerrain?: (terrain: unknown) => void;
    pick(position: { x: number; y: number }): CesiumPicked | undefined;
    renderError: { addEventListener(listener: (error: unknown) => void): void };
  };
  destroy(): void;
  isDestroyed(): boolean;
}

export interface CesiumStatic {
  Viewer: new (element: HTMLElement, options: Record<string, unknown>) => CesiumViewer;
  Cartesian3: { fromDegrees(longitude: number, latitude: number, height?: number): unknown };
  Cartographic: {
    fromDegrees(longitude: number, latitude: number, height?: number): CesiumCartographic;
    fromCartesian(cartesian: unknown): CesiumCartographic;
  };
  Math: { toRadians(degrees: number): number; toDegrees(radians: number): number };
  Color: {
    new (red: number, green: number, blue: number, alpha?: number): unknown;
    fromCssColorString(css: string): unknown;
    WHITE: unknown;
  };
  Material?: {
    fromType(type: unknown, uniforms?: Record<string, unknown>): unknown;
    ColorType: unknown;
  };
  UrlTemplateImageryProvider?: new (options: Record<string, unknown>) => unknown;
  TileMapServiceImageryProvider?: { fromUrl(url: string): Promise<unknown> };
  SingleTileImageryProvider?: {
    new (options: Record<string, unknown>): unknown;
    fromUrl?: (url: string, options?: Record<string, unknown>) => Promise<unknown>;
  };
  Rectangle: { fromDegrees(west: number, south: number, east: number, north: number): unknown };
  CustomDataSource?: new (name: string) => CesiumDataSourceHandle;
  GeoJsonDataSource?: {
    load(url: string, options?: Record<string, unknown>): Promise<CesiumDataSourceHandle>;
  };
  ScreenSpaceEventHandler?: new (canvas: HTMLCanvasElement) => CesiumInputHandler;
  ScreenSpaceEventType?: { LEFT_CLICK: unknown };
  PointPrimitiveCollection?: new () => CesiumPointCollection;
  PolylineCollection?: new () => CesiumLineCollection;
  ImageMaterialProperty?: new (options: Record<string, unknown>) => unknown;
  JulianDate?: { fromIso8601(iso: string): unknown };
  Ion: { defaultAccessToken: string };
  IonImageryProvider?: { fromAssetId(assetId: number): Promise<unknown> };
  Cesium3DTileset?: { fromIonAssetId(assetId: number): Promise<unknown> };
  CesiumTerrainProvider?: { fromIonAssetId(assetId: number): Promise<unknown> };
  Terrain?: new (provider: unknown) => unknown;
  EllipsoidTerrainProvider?: new () => unknown;
  OpenStreetMapImageryProvider?: new (options: Record<string, unknown>) => unknown;
  VerticalOrigin?: { CENTER: unknown };
  HorizontalOrigin?: { CENTER: unknown };
  LabelStyle?: { FILL_AND_OUTLINE: unknown };
  EasingFunction?: { QUADRATIC_IN_OUT: unknown };
}

export function getCesium(): CesiumStatic | null {
  return (window as unknown as { Cesium?: CesiumStatic }).Cesium ?? null;
}
