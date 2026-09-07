import type { Dataset } from '../types';
export function projection(dataset: Dataset) {
  const [west, east] = dataset.bounds.longitude,
    [south, north] = dataset.bounds.latitude;
  const scale = 18 / (east - west);
  return {
    x: (lon: number) => (lon - (west + east) / 2) * scale,
    z: (lat: number) => -(lat - (south + north) / 2) * scale,
    lon: (x: number) => x / scale + (west + east) / 2,
    lat: (z: number) => -z / scale + (south + north) / 2,
    width: 18,
    height: (north - south) * scale,
    scale,
  };
}
export function depthY(depth: number, exaggeration: number) {
  return -depth * 0.00036 * exaggeration;
}
