import type { Comparison, Dataset } from '../types';
import type { LandingObservation } from '../cesium/CesiumObservations';
import type { LandingSceneDef } from './LandingScenes';
import type { LandingScene } from '../experience/experienceState';
import { TechnicalLabel, TelemetryValue } from '../components/hudPrimitives';

interface Props {
  scene: LandingScene;
  def: LandingSceneDef;
  dataset: Dataset | null;
  observationCount: number;
  selected: LandingObservation | null;
  diveDepth: number;
  comparison: Comparison | null;
  compareState: 'idle' | 'loading' | 'error';
}

function formatMetric(value: number | undefined, units: string) {
  if (value === undefined || !Number.isFinite(value)) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)} ${units}`;
}

// Narrative overlay. Introduces capabilities with live dataset values;
// never a control surface — the explorer owns all controls.
export default function LandingHUD({
  scene,
  def,
  dataset,
  observationCount,
  selected,
  diveDepth,
  comparison,
  compareState,
}: Props) {
  return (
    <div className="landing-hud" aria-live="polite">
      <div className="landing-kicker">
        <span className="tiny-dot" />
        <TechnicalLabel>{def.eyebrow}</TechnicalLabel>
      </div>
      <h1>{def.title}</h1>
      <p>{def.body}</p>

      {scene === 'ocean' && (
        <div className="landing-fact">
          <span>SURFACE VELOCITY · MODEL U/V</span>
          <div className="landing-scale">
            <i>0.00</i>
            <b />
            <i>1.50 m/s</i>
          </div>
        </div>
      )}

      {scene === 'observations' && (
        <div className="landing-fact landing-symbols">
          <span>
            <i className="sym-argo" /> ARGO <i className="sym-glider" /> GLIDER{' '}
            <i className="sym-bgc" /> BGC
          </span>
          {selected && (
            <strong>
              {selected.id} · {selected.max_depth.toLocaleString()} m
            </strong>
          )}
          {!selected && observationCount > 0 && <strong>{observationCount} INSTRUMENTS</strong>}
        </div>
      )}

      {scene === 'depth' && (
        <div className="landing-depth">
          <TechnicalLabel>MODEL DEPTH LEVEL</TechnicalLabel>
          <TelemetryValue>
            {diveDepth.toLocaleString()} <small>m</small>
          </TelemetryValue>
        </div>
      )}

      {scene === 'time' && dataset && (
        <div className="landing-fact landing-vars">
          {dataset.variables.map((v) => (
            <span key={v.id}>
              {v.name.toUpperCase()}
              <small>
                {v.range[0].toFixed(1)} – {v.range[1].toFixed(1)} {v.units}
              </small>
            </span>
          ))}
          <em>{dataset.synthetic ? 'SYNTHETIC DEMONSTRATION DATASET' : 'LOCAL DATA'}</em>
        </div>
      )}

      {scene === 'observations' && (
        <div className="landing-fact landing-compare">
          {compareState === 'loading' && <span>COLLOCATING MODEL PROFILE…</span>}
          {compareState === 'error' && <span>COMPARISON READY</span>}
          {compareState === 'idle' && !comparison && <span>COMPARISON READY</span>}
          {comparison?.metrics && (
            <>
              <span>MODEL ↔ OBSERVED · {comparison.matched_samples} LEVELS</span>
              <div className="landing-metrics">
                <div>
                  <span>RMSE</span>
                  <strong>{formatMetric(comparison.metrics.rmse, comparison.units)}</strong>
                </div>
                <div>
                  <span>MAE</span>
                  <strong>{formatMetric(comparison.metrics.mae, comparison.units)}</strong>
                </div>
                <div>
                  <span>BIAS</span>
                  <strong>{formatMetric(comparison.metrics.bias, comparison.units)}</strong>
                </div>
              </div>
            </>
          )}
          {dataset?.synthetic && <em>SYNTHETIC INSTRUMENT PROFILES</em>}
        </div>
      )}
    </div>
  );
}
