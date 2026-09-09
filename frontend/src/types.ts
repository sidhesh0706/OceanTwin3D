export type Variable = 'temperature' | 'salinity' | 'chlorophyll' | 'current_speed';
export type Mode = 'slice' | 'volume' | 'currents' | 'iso';
export type CameraPreset =
  | 'global'
  | 'approach'
  | 'domain'
  | 'surface'
  | 'underwater'
  | 'dive-200m'
  | 'dive-500m'
  | 'dive-1000m'
  | 'dive-2000m'
  // Ocean-specific presets (fly to centre of each basin)
  | 'pacific'
  | 'atlantic'
  | 'indian'
  | 'southern'
  | 'arctic';
export interface VariableMeta {
  id: Variable;
  name: string;
  units: string;
  range: [number, number];
}
export interface Dataset {
  id: string;
  name: string;
  synthetic: boolean;
  global: boolean;
  grid: Record<string, number>;
  bounds: Record<'latitude' | 'longitude' | 'depth', [number, number]>;
  variables: VariableMeta[];
  times: string[];
  depths: number[];
  has_currents: boolean;
}
export interface Field {
  variable: Variable;
  units: string;
  time: number;
  timestamp: string;
  depth: number | null;
  depths: number[];
  latitudes: number[];
  longitudes: number[];
  values: (number | null)[][] | (number | null)[][][];
  range: [number | null, number | null];
  wet_mask?: (0 | 1)[][] | null; // 2-D boolean grid from backend: 1=ocean, 0=land
}
export interface Currents {
  depth: number;
  time: number;
  latitudes: number[];
  longitudes: number[];
  u: (number | null)[][];
  v: (number | null)[][];
}
export interface Observation {
  id: string;
  instrument_type: 'ARGO' | 'GLIDER' | 'CTD' | 'BGC' | 'MOORING' | 'ADCP';
  latitude: number;
  longitude: number;
  timestamp: string;
  synthetic: boolean;
  max_depth: number;
}
export interface Comparison {
  instrument_id: string;
  variable: Variable;
  units: string;
  profiles: { depth: number; model: number | null; observed: number | null }[];
  method: string;
  model_time: string;
  observation_time: string;
  time_offset_hours: number;
  matched_samples: number;
  metrics: { rmse: number; mae: number; bias: number } | null;
}
export interface Inspection {
  latitude: number;
  longitude: number;
  depth: number;
  values: Partial<Record<Variable, number | null>>;
}
export interface ProfileResult {
  latitude: number;
  longitude: number;
  time: number;
  timestamp: string;
  depths: number[];
  variables: Record<string, string>;
  profiles: Record<string, number | null>[];
}
export interface TransectPoint {
  distance_km: number;
  latitude: number;
  longitude: number;
  value: number | null;
}
export interface TransectResult {
  variable: Variable;
  units: string;
  depth: number;
  time: number;
  timestamp: string;
  total_distance_km: number;
  points: TransectPoint[];
}
export interface RegionStats {
  variable: Variable;
  units: string;
  depth: number;
  time: number;
  timestamp: string;
  bounds: { lat: [number, number]; lon: [number, number] };
  wet_cells: number;
  total_cells: number;
  mean: number;
  std: number;
  min: number;
  max: number;
  median: number;
}
export interface Land {
  type: 'FeatureCollection';
  features: {
    geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: number[][][] | number[][][][] };
  }[];
}
export interface Frame {
  slice: Field;
  volume: Field;
  currents: Currents | null;
}
export interface RegionalView {
  dataset: Dataset;
  frame: Frame;
  observations: Observation[];
  land: Land;
}
