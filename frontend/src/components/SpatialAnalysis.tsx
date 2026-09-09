import { useEffect, useRef, useState } from 'react';
import { X, Play, MapPin } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api, stamp } from '../services/api';
import type { Dataset, Field, ProfileResult, RegionStats, TransectResult } from '../types';
import './spatial-analysis.css';

export type AnalysisKind = 'profile' | 'transect' | 'stats';
type Point = { lat: number; lon: number };
type Result =
  | { kind: 'profile'; data: ProfileResult }
  | { kind: 'transect'; data: TransectResult }
  | { kind: 'stats'; data: RegionStats };
const titles = { profile: 'Profile probe', transect: 'Ocean transect', stats: 'Region statistics' };

export function SpatialAnalysis({
  kind,
  dataset,
  field,
  picked,
  onClose,
}: {
  kind: AnalysisKind;
  dataset: Dataset;
  field: Field;
  picked: Point | null;
  onClose: () => void;
}) {
  const initial = (fraction: number): Point =>
    dataset.global
      ? { lat: fraction === 0.3 ? 5 : 15, lon: fraction === 0.3 ? 65 : 85 }
      : {
          lat:
            dataset.bounds.latitude[0] +
            fraction * (dataset.bounds.latitude[1] - dataset.bounds.latitude[0]),
          lon:
            dataset.bounds.longitude[0] +
            fraction * (dataset.bounds.longitude[1] - dataset.bounds.longitude[0]),
        };
  const [a, setA] = useState<Point>(() => initial(0.3));
  const [b, setB] = useState<Point>(() => initial(0.7));
  const [next, setNext] = useState<'A' | 'B'>('A');
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  const invalidate = () => {
    controller.current?.abort();
    setBusy(false);
    setResult(null);
    setError('');
  };
  useEffect(() => {
    invalidate();
    return () => controller.current?.abort();
  }, [field, kind]);
  useEffect(() => {
    if (!picked) return;
    invalidate();
    const point = { lat: +picked.lat.toFixed(3), lon: +picked.lon.toFixed(3) };
    if (next === 'A' || kind === 'profile') setA(point);
    else setB(point);
    setNext(next === 'A' && kind !== 'profile' ? 'B' : 'A');
    // Only a new map pick advances the endpoint selector.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked]);
  async function run() {
    invalidate();
    const c = new AbortController();
    controller.current = c;
    setBusy(true);
    try {
      let value: Result;
      if (kind === 'profile')
        value = { kind, data: await api.profile(a.lat, a.lon, field.time, c.signal) };
      else if (kind === 'transect')
        value = {
          kind,
          data: await api.transect(
            a.lat,
            a.lon,
            b.lat,
            b.lon,
            field.depth ?? 0,
            field.time,
            field.variable,
            c.signal,
          ),
        };
      else
        value = {
          kind,
          data: await api.regionStats(
            Math.min(a.lat, b.lat),
            Math.max(a.lat, b.lat),
            Math.min(a.lon, b.lon),
            Math.max(a.lon, b.lon),
            field.depth ?? 0,
            field.time,
            field.variable,
            c.signal,
          ),
        };
      if (!c.signal.aborted) setResult(value);
    } catch (e) {
      if (!c.signal.aborted) setError(e instanceof Error ? e.message : 'Analysis failed.');
    } finally {
      if (!c.signal.aborted) setBusy(false);
    }
  }
  const meta = dataset.variables.find((v) => v.id === field.variable)!;
  const chart: Record<string, number | null>[] =
    result?.kind === 'transect'
      ? result.data.points.map((p) => ({ ...p }))
      : result?.kind === 'profile'
        ? result.data.profiles
        : [];
  const profile = result?.kind === 'profile';
  return (
    <section className="spatial-analysis" role="dialog" aria-label={titles[kind]}>
      <div className="sa-heading">
        <div>
          <span>SPATIAL ANALYSIS</span>
          <h2>{titles[kind]}</h2>
        </div>
        <button className="icon-button" aria-label="Close spatial analysis" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <p className="sa-context">
        {meta.name} · {kind === 'profile' ? 'Full depth column' : `${field.depth} m`}
        <br />
        {stamp(field.timestamp)}
      </p>
      <p className="sa-hint">
        <MapPin size={14} /> Click the ocean to set{' '}
        {kind === 'profile' ? 'the probe' : `point ${next}`}, or enter coordinates.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        {(kind === 'profile' ? ['A'] : ['A', 'B']).map((label) => {
          const point = label === 'A' ? a : b;
          return (
            <fieldset key={label}>
              <legend>
                {kind === 'profile'
                  ? 'Probe location'
                  : kind === 'stats'
                    ? `Corner ${label}`
                    : `Endpoint ${label}`}
              </legend>
              {(['lat', 'lon'] as const).map((axis) => (
                <label key={axis}>
                  {axis === 'lat' ? 'Latitude' : 'Longitude'}
                  <input
                    aria-label={`${label} ${axis === 'lat' ? 'latitude' : 'longitude'}`}
                    type="number"
                    step="any"
                    required
                    min={axis === 'lat' ? dataset.bounds.latitude[0] : -180}
                    max={axis === 'lat' ? dataset.bounds.latitude[1] : 180}
                    value={point[axis]}
                    onChange={(e) => {
                      invalidate();
                      (label === 'A' ? setA : setB)({ ...point, [axis]: +e.target.value });
                    }}
                  />
                </label>
              ))}
            </fieldset>
          );
        })}
        <button className="sa-run" disabled={busy} type="submit">
          <Play size={13} />
          {busy ? 'Computing…' : 'Run analysis'}
        </button>
      </form>
      {error && (
        <p role="alert" className="sa-error">
          {error}
        </p>
      )}
      {result && result.kind !== 'stats' && (
        <>
          <div
            className="sa-chart"
            aria-label={profile ? 'Value versus depth profile' : 'Value versus distance transect'}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chart}
                layout={profile ? 'vertical' : 'horizontal'}
                margin={{ top: 12, right: 18, left: 0, bottom: 18 }}
              >
                <CartesianGrid stroke="#263b49" strokeDasharray="3 4" />
                <XAxis
                  type="number"
                  dataKey={profile ? field.variable : 'distance_km'}
                  domain={['auto', 'auto']}
                  tick={{ fill: '#adc3ce', fontSize: 10 }}
                  label={{
                    value: profile ? meta.units : 'Distance (km)',
                    position: 'bottom',
                    fill: '#adc3ce',
                    fontSize: 11,
                  }}
                />
                <YAxis
                  type="number"
                  dataKey={profile ? 'depth' : 'value'}
                  domain={profile ? [0, dataset.bounds.depth[1]] : ['auto', 'auto']}
                  tick={{ fill: '#adc3ce', fontSize: 10 }}
                  width={48}
                  label={{
                    value: profile ? 'Depth (m)' : meta.units,
                    angle: -90,
                    position: 'insideLeft',
                    fill: '#adc3ce',
                    fontSize: 10,
                  }}
                />
                <Tooltip
                  contentStyle={{
                    background: '#10212c',
                    border: '1px solid #355363',
                    color: '#eaf7ff',
                    fontSize: 12,
                  }}
                />
                <Line
                  type="linear"
                  dataKey={profile ? field.variable : 'value'}
                  stroke="#54e0d0"
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {result.kind === 'transect' && (
            <p className="sa-method">
              {result.data.total_distance_km.toLocaleString()} km · shortest great-circle route ·
              fixed-depth samples. Gaps indicate land or missing data.
            </p>
          )}
          {result.kind === 'profile' && (
            <div className="sa-table">
              <table>
                <thead>
                  <tr>
                    <th>m</th>
                    {dataset.variables.map((v) => (
                      <th key={v.id} title={v.name}>
                        {v.name}
                        <small>{v.units}</small>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.data.profiles.map((row, i) => (
                    <tr key={i}>
                      <td>{row.depth}</td>
                      {dataset.variables.map((v) => (
                        <td key={v.id}>{row[v.id]?.toFixed(2) ?? '—'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {chart.every(
            (row) => (row as Record<string, unknown>)[profile ? field.variable : 'value'] == null,
          ) && <p className="sa-error">No wet samples here. Choose another ocean location.</p>}
        </>
      )}
      {result?.kind === 'stats' && (
        <>
          <dl className="sa-metrics">
            {(['mean', 'min', 'max', 'std', 'median'] as const).map((key) => (
              <div key={key}>
                <dt>{key === 'std' ? 'Std deviation' : key}</dt>
                <dd>
                  {result.data[key].toFixed(3)} <small>{result.data.units}</small>
                </dd>
              </div>
            ))}
          </dl>
          <p className="sa-method">
            {result.data.wet_cells} wet / {result.data.total_cells} cells. Unweighted grid-cell
            statistics; population standard deviation. Regions use increasing longitude bounds and
            do not wrap the dateline.
          </p>
        </>
      )}
      <p className="sa-method">
        {dataset.synthetic ? 'Synthetic demonstration model.' : 'Local model.'} Linear interpolation
        preserves missing samples.
      </p>
    </section>
  );
}
