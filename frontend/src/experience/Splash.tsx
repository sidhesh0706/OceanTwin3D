import { useEffect, useState } from 'react';

// Cinematic title card above the live landing (which initializes
// underneath, untouched). Phased ~2.2 s sequence so the brand can actually
// be read: ENTER (stars + wordmark resolve) → HOLD (stable lockup) → EXIT
// (smooth fade into the landing). Scroll is parked for the duration, then
// restored. Reduced-motion users get a short fade instead.
type Phase = 'enter' | 'hold' | 'exit';

const HOLD_MS = 700;
const EXIT_MS = 1700;
const SEQUENCE_MS = 2200;
const REDUCED_MS = 650;

export default function Splash() {
  const [phase, setPhase] = useState<Phase>('enter');
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.scrollTo(0, 0);
    if (reduced) {
      const id = window.setTimeout(() => {
        document.body.style.overflow = prev;
        setGone(true);
      }, REDUCED_MS);
      return () => {
        window.clearTimeout(id);
        document.body.style.overflow = prev;
      };
    }
    // NOTE: setGone only swaps render output to null — the component stays
    // mounted, so this cleanup does NOT run at sequence end. The lock must
    // be released inside the final timer itself, or scroll stays dead forever.
    const t1 = window.setTimeout(() => setPhase('hold'), HOLD_MS);
    const t2 = window.setTimeout(() => setPhase('exit'), EXIT_MS);
    const t3 = window.setTimeout(() => {
      document.body.style.overflow = prev;
      setGone(true);
    }, SEQUENCE_MS);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      document.body.style.overflow = prev;
    };
  }, []);

  if (gone) return null;
  return (
    <div className={`splash is-${phase}`} role="status" aria-label="OceanTwin">
      <div className="splash-bg" aria-hidden="true">
        <div className="splash-drift" aria-hidden="true" />
      </div>
      <span className="splash-sweep" aria-hidden="true" />
      <span className="splash-title" aria-label="OCEANTWIN">
        <span className="splash-ocean" aria-hidden="true">
          OCEAN
        </span>
        <span className="splash-twin" aria-hidden="true">
          TWIN
        </span>
      </span>
      <span className="splash-sub">OCEAN DATA INTELLIGENCE</span>
    </div>
  );
}
