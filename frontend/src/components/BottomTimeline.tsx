import { Play, Pause, SkipBack, SkipForward } from 'lucide-react';
import type { Dataset, Frame } from '../types';
import { stamp } from '../services/api';

interface Props {
  dataset: Dataset;
  frame: Frame;
  time: number;
  onTime: (t: number) => void;
  playing: boolean;
  onPlay: () => void;
  onTour: () => void;
  tourActive: boolean;
  hasSynthetic: boolean;
}

export function BottomTimeline({
  dataset,
  frame,
  time,
  onTime,
  playing,
  onPlay,
  onTour,
  tourActive,
  hasSynthetic,
}: Props) {
  // Pick 4 evenly-spaced label indices
  const n = dataset.times.length;
  const labelIndices = [
    ...new Set([0, Math.floor(n / 3), Math.floor((2 * n) / 3), n - 1]),
  ];

  return (
    <footer className="btl" aria-label="Temporal explorer">
      {/* Left: playback controls + timestamp */}
      <div className="btl-left">
        <button
          className="btl-play"
          aria-label={playing ? 'Pause' : 'Play'}
          onClick={onPlay}
        >
          {playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
        </button>
        <button
          aria-label="Previous timestep"
          className="btl-step"
          onClick={() => onTime((time - 1 + n) % n)}
        >
          <SkipBack size={14} />
        </button>
        <button
          aria-label="Next timestep"
          className="btl-step"
          onClick={() => onTime((time + 1) % n)}
        >
          <SkipForward size={14} />
        </button>
        <span className="btl-ts">{stamp(frame.slice.timestamp)}</span>
      </div>

      {/* Center: timeline slider + labels */}
      <div className="btl-track">
        <input
          aria-label="Model time"
          type="range"
          min={0}
          max={n - 1}
          step={1}
          value={time}
          onChange={(e) => {
            onTime(+e.target.value);
          }}
        />
        <div className="btl-labels">
          {labelIndices.map((i) => (
            <span key={i}>
              {new Date(dataset.times[i]).toLocaleString('en-GB', {
                day: '2-digit',
                month: 'short',
                timeZone: 'UTC',
              })}
            </span>
          ))}
        </div>
      </div>

      {/* Right: frame counter + optional tour */}
      <div className="btl-right">
        <span className="btl-frame">
          Frame {String(time + 1).padStart(2, '0')} / {n}
        </span>
        {hasSynthetic && (
          <button
            className={`btl-tour ${tourActive ? 'active' : ''}`}
            onClick={onTour}
            aria-label={tourActive ? 'Stop demo tour' : 'Start demo tour'}
          >
            {tourActive ? <Pause size={13} /> : <Play size={13} />}
            <span>{tourActive ? 'Stop Tour' : 'Demo Tour'}</span>
          </button>
        )}
      </div>
    </footer>
  );
}
