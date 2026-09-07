export type Variable = 'temperature' | 'salinity' | 'chlorophyll' | 'current_speed';
export type Mode = 'slice' | 'volume' | 'currents' | 'iso';
export type CameraPreset = 'regional' | 'surface' | 'underwater';
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
  instrument_type: 'ARGO' | 'GLIDER' | 'CTD' | 'MOORING' | 'ADCP';
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
