import { useEffect, useState } from 'react';
import { X, ArrowUpRight, Radio, Navigation, Layers, Check } from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import type { Comparison, Dataset, Field, Inspection, Observation, Variable } from '../types';
import { api, coordinate, stamp } from '../services/api';

interface Props {
  dataset: Dataset;
  field: Field;
  observations: Observation[];
  selected: Observation | null;
  onSelect: (o: Observation | null) => void;
  inspection: Inspection | null;
  onClearInspection: () => void;
  compare: boolean;
  setCompare: (v: boolean) => void;
}
export function Inspector({
  dataset,
  field,
  observations,
  selected,
  onSelect,
  inspection,
  onClearInspection,
  compare,
  setCompare,
}: Props) {
  const [profileVariable, setProfileVariable] = useState<Variable>('temperature'),
    [result, setResult] = useState<Comparison | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false);
  const profileVariables = dataset.variables.filter((v) => v.id !== 'current_speed');
  useEffect(() => {
    if (!profileVariables.some((v) => v.id === profileVariable) && profileVariables.length)
      setProfileVariable(profileVariables[0].id);
  }, [dataset, profileVariable, profileVariables]);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    setLoading(true);
    setResult(null);
    setError('');
    api
      .compare(selected.id, profileVariable, field.time, controller.signal)
      .then(setResult)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [selected, profileVariable, field.time]);
  const typeCounts = new Map<string, number>();
  for (const o of observations)
    typeCounts.set(o.instrument_type, (typeCounts.get(o.instrument_type) ?? 0) + 1);
  return (
    <aside className="inspector-float">
      <div className="panel-heading">
        <span>{selected ? 'OBSERVATION INSPECTOR' : 'POINT INSPECTION'}</span>
        <button
          className="icon-button"
          aria-label="Close inspector"
          onClick={() => {
            onSelect(null);
            onClearInspection();
          }}
        >
          <X size={15} />
        </button>
      </div>

      {selected ? (
        <div className="inspector-body" key={selected.id}>
          <div className="instrument-heading">
            <span className="sensor-icon">
              {selected.instrument_type === 'ARGO' ? (
                <Radio size={21} />
              ) : selected.instrument_type === 'GLIDER' ? (
                <Navigation size={21} />
              ) : (
                <Layers size={21} />
              )}
            </span>
            <div>
              <span className="eyebrow">{selected.instrument_type} PROFILE</span>
              <h2>{selected.id}</h2>
            </div>
          </div>
          <p className="coordinates">
            {coordinate(selected.latitude, true)} <span>/</span> {coordinate(selected.longitude)}
          </p>
          <dl className="details">
            <div>
              <dt>Profile recorded</dt>
              <dd>{stamp(selected.timestamp)}</dd>
            </div>
            <div>
              <dt>Maximum depth</dt>
              <dd>{selected.max_depth.toLocaleString()} m</dd>
            </div>
          </dl>
          {selected.synthetic && <div className="synthetic-note">SYNTHETIC INSTRUMENT PROFILE</div>}
          <div className="profile-tabs">
            {profileVariables.map((v) => (
              <button
                key={v.id}
                className={profileVariable === v.id ? 'active' : ''}
                onClick={() => setProfileVariable(v.id)}
              >
                {v.name}
              </button>
            ))}
          </div>
          <label className="comparison-toggle">
            <input
              type="checkbox"
              checked={compare}
              onChange={(e) => setCompare(e.target.checked)}
            />
            <span>Compare with model</span>
            <Layers size={14} />
          </label>
          {loading ? (
            <div className="chart-message">
              <span className="spinner" />
              Collocating model profile…
            </div>
          ) : error ? (
            <div className="chart-message error-text">{error}</div>
          ) : result ? (
            <>
              <div className="profile-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={result.profiles}
                    layout="vertical"
                    margin={{ top: 12, right: 8, bottom: 12, left: 0 }}
                  >
                    <CartesianGrid stroke="#243340" strokeDasharray="2 5" />
                    <XAxis
                      type="number"
                      domain={['auto', 'auto']}
                      tick={{ fill: '#91a4b5', fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      tickCount={4}
                      label={{
                        value: result.units,
                        position: 'insideBottomRight',
                        offset: -8,
                        fill: '#91a4b5',
                        fontSize: 10,
                      }}
                    />
                    <YAxis
                      type="number"
                      dataKey="depth"
                      domain={[0, selected.max_depth]}
                      tick={{ fill: '#91a4b5', fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      width={43}
                      tickCount={5}
                      label={{
                        value: 'DEPTH (m)',
                        angle: -90,
                        position: 'insideLeft',
                        fill: '#91a4b5',
                        fontSize: 9,
                      }}
                    />
                    <Tooltip
                      contentStyle={{
                        background: '#101e2b',
                        border: '1px solid #354959',
                        fontSize: 12,
                      }}
                      labelFormatter={(v) => `${v} m`}
                      formatter={(v) => (typeof v === 'number' ? v.toFixed(3) : 'No sample')}
                    />
                    {compare && (
                      <Line
                        name="Model"
                        dataKey="model"
                        stroke="#4ea4ff"
                        strokeWidth={2}
                        strokeDasharray="5 3"
                        dot={false}
                        connectNulls={false}
                        isAnimationActive={false}
                      />
                    )}
                    <Line
                      name="Observed"
                      dataKey="observed"
                      stroke="#8be7cd"
                      strokeWidth={2}
                      dot={{ r: 2, strokeWidth: 0, fill: '#8be7cd' }}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="chart-legend">
                <span>
                  <i />
                  Observed
                </span>
                {compare && (
                  <span>
                    <i className="model" />
                    Model
                  </span>
                )}
              </div>
              {compare && (
                <>
                  <div className="metrics">
                    {(['rmse', 'mae', 'bias'] as const).map((key) => (
                      <div key={key}>
                        <span>{key.toUpperCase()}</span>
                        <strong>
                          {result.metrics
                            ? `${key === 'bias' && result.metrics[key] > 0 ? '+' : ''}${result.metrics[key].toFixed(3)}`
                            : '—'}
                        </strong>
                        <small>{result.units}</small>
                      </div>
                    ))}
                  </div>
                  <p className="method-note">
                    {result.matched_samples} matched levels · linear spatial interpolation
                    <br />
                    Bias = model − observed
                  </p>
                  <div className={`time-offset ${result.time_offset_hours ? 'offset' : ''}`}>
                    {result.time_offset_hours === 0 ? (
                      <>
                        <Check size={12} /> Model and profile times aligned
                      </>
                    ) : (
                      <>
                        Model time is {Math.abs(result.time_offset_hours)} h{' '}
                        {result.time_offset_hours > 0 ? 'after' : 'before'} this profile
                      </>
                    )}
                  </div>
                </>
              )}
            </>
          ) : null}
        </div>
      ) : inspection ? (
        <div className="inspector-body">
          <span className="eyebrow">SELECTED WATER PARCEL</span>
          <h2>
            {inspection.depth.toLocaleString()} <small>m below surface</small>
          </h2>
          <p className="coordinates">
            {coordinate(inspection.latitude, true)}
            <br />
            {coordinate(inspection.longitude)}
          </p>
          <dl className="details inspection-values">
            {dataset.variables.map((v) => (
              <div key={v.id}>
                <dt>{v.name}</dt>
                <dd>
                  {inspection.values[v.id]?.toFixed(3) ?? 'No wet sample'}{' '}
                  <small>
                    {inspection.values[v.id] !== null && inspection.values[v.id] !== undefined
                      ? v.units
                      : ''}
                  </small>
                </dd>
              </div>
            ))}
          </dl>
          <p className="method-note">
            Interpolated at the selected location, depth, and model time. Missing coastal cells
            remain missing.
          </p>
        </div>
      ) : (
        <div className="inspector-body">
          <span className="eyebrow">ACTIVE MODEL</span>
          <h2>{dataset.synthetic ? 'Indian Ocean' : dataset.name}</h2>
          <p className="model-id">{dataset.id}</p>
          <dl className="details">
            <div>
              <dt>Model timestamp</dt>
              <dd>{stamp(field.timestamp)}</dd>
            </div>
            <div>
              <dt>Model grid</dt>
              <dd>
                {dataset.grid.longitude} × {dataset.grid.latitude} <small>horizontal cells</small>
              </dd>
            </div>
            <div>
              <dt>Water column</dt>
              <dd>
                {dataset.grid.depth} levels <span>·</span>{' '}
                {dataset.bounds.depth[1].toLocaleString()} m
              </dd>
            </div>
            <div>
              <dt>Domain</dt>
              <dd className="hud-coordinates">
                {coordinate(dataset.bounds.latitude[0], true)} –{' '}
                {coordinate(dataset.bounds.latitude[1], true)}
                <br />
                {coordinate(dataset.bounds.longitude[0])} –{' '}
                {coordinate(dataset.bounds.longitude[1])}
              </dd>
            </div>
            <div>
              <dt>Selected layer range</dt>
              <dd>
                {field.range[0]?.toFixed(2) ?? '—'} — {field.range[1]?.toFixed(2) ?? '—'}{' '}
                <small>{field.units}</small>
              </dd>
            </div>
          </dl>
          <div className="section-rule" />
          <div className="section-title">
            <span className="eyebrow">OBSERVATION NETWORK</span>
            <span>{observations.length.toString().padStart(2, '0')}</span>
          </div>
          <div className="network-summary">
            {[...typeCounts].map(([type, n]) => (
              <span key={type}>
                <i className={type === 'GLIDER' ? 'glider-dot' : 'argo-dot'} />
                {n} {type.toLowerCase()}s
              </span>
            ))}
          </div>
          <div className="observation-list">
            {observations.map((o) => (
              <button key={o.id} onClick={() => onSelect(o)}>
                <span className={o.instrument_type === 'ARGO' ? 'argo-dot' : 'glider-dot'} />
                <span>
                  {o.id}
                  <small>
                    {coordinate(o.latitude, true)} · {coordinate(o.longitude)}
                  </small>
                </span>
                <ArrowUpRight size={13} />
              </button>
            ))}
          </div>
          {!observations.length && (
            <p className="method-note">
              No observation profiles are attached to this dataset. Configure OCEANTWIN_OBSERVATIONS
              to load a sensor network.
            </p>
          )}
          <div className="context-footnote">
            <span className="tiny-dot" />
            {dataset.synthetic ? 'Analytic model · simulated observations' : 'Local NetCDF dataset'}
          </div>
        </div>
      )}
    </aside>
  );
}
