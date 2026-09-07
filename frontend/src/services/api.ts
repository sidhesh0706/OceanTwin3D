import type {
  Comparison,
  Currents,
  Dataset,
  Field,
  Inspection,
  Observation,
  Variable,
} from '../types';

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(
      typeof body?.detail === 'string'
        ? body.detail
        : `Ocean data service returned ${response.status}.`,
    );
  }
  const json: unknown = await response.json();
  if (json === null || typeof json !== 'object')
    throw new Error('The ocean service returned an incomplete response.');
  return json as T;
}
export const api = {
  datasets: () => request<Dataset[]>('/api/datasets'),
  observations: () => request<Observation[]>('/api/observations'),
  field: (variable: Variable, time: number, depth: number | null, signal: AbortSignal) =>
    request<Field>(
      `/api/ocean/${depth === null ? 'volume' : 'slice'}?variable=${variable}&time=${time}${depth === null ? '' : `&depth=${depth}`}`,
      { signal },
    ),
  currents: (time: number, depth: number, signal: AbortSignal) =>
    request<Currents>(`/api/currents?time=${time}&depth=${depth}`, { signal }),
  compare: (id: string, variable: Variable, time: number, signal: AbortSignal) =>
    request<Comparison>(
      `/api/compare/${encodeURIComponent(id)}?variable=${variable}&time=${time}`,
      { signal },
    ),
  inspect: (lat: number, lon: number, depth: number, time: number, signal: AbortSignal) =>
    request<Inspection>(
      `/api/ocean/inspect?latitude=${lat}&longitude=${lon}&depth=${depth}&time=${time}`,
      { signal },
    ),
};
export function validateDataset(d: Dataset): Dataset {
  if (!d || !d.variables?.length || !d.times?.length || !d.depths?.length || !d.bounds || !d.grid)
    throw new Error('The dataset metadata is incomplete.');
  return d;
}
export function validateField(f: Field): Field {
  if (
    !Array.isArray(f.values) ||
    !f.latitudes?.length ||
    !f.longitudes?.length ||
    !f.depths?.length
  )
    throw new Error('The model field is incomplete.');
  const layers =
    f.depth === null ? (f.values as (number | null)[][][]) : [f.values as (number | null)[][]];
  if (
    layers.length !== f.depths.length ||
    layers.some(
      (layer) =>
        layer.length !== f.latitudes.length ||
        layer.some(
          (row) =>
            row.length !== f.longitudes.length ||
            row.some((v) => v !== null && !Number.isFinite(v)),
        ),
    )
  )
    throw new Error('The model grid dimensions do not match its values.');
  return f;
}
export function stamp(value: string) {
  return (
    new Date(value)
      .toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC',
      })
      .replace(',', ' ·') + ' UTC'
  );
}
export function coordinate(value: number, lat = false) {
  return `${Math.abs(value).toFixed(2)}° ${lat ? (value < 0 ? 'S' : 'N') : value < 0 ? 'W' : 'E'}`;
}
