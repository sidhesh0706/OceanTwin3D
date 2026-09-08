import { useState } from 'react';

interface Props {
  range: [number, number];
  onChange: (r: [number, number]) => void;
  onReset: () => void;
}

export function ColorRangeInputs({ range, onChange, onReset }: Props) {
  const [min, setMin] = useState(String(range[0]));
  const [max, setMax] = useState(String(range[1]));
  const [invalid, setInvalid] = useState(false);
  function commit() {
    const a = Number(min),
      b = Number(max);
    if (min.trim() && max.trim() && Number.isFinite(a) && Number.isFinite(b) && a < b) {
      onChange([a, b]);
      setInvalid(false);
    } else setInvalid(true);
  }
  return (
    <div className="cri">
      <div className="cri-row">
        <label>
          MIN
          <input
            aria-label="Color minimum"
            type="number"
            step="any"
            value={min}
            onChange={(e) => setMin(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && commit()}
          />
        </label>
        <span>—</span>
        <label>
          MAX
          <input
            aria-label="Color maximum"
            type="number"
            step="any"
            value={max}
            onChange={(e) => setMax(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && commit()}
          />
        </label>
      </div>
      {invalid && <small className="error-text">Min must be less than max.</small>}
      <button className="fp-text-btn" onClick={onReset}>
        Reset range
      </button>
    </div>
  );
}
