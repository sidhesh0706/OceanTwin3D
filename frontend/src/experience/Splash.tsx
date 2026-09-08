import { useEffect, useState } from 'react';

// Cinematic title → world transition. One continuous overlay shot above the
// real landing (which initializes underneath, untouched): brand reveal,
// hold, subtle forward drift, wordmark collapse into a blue center point,
// iris reveal of the landing beneath, clean unmount. Timing is independent
// of loading; a single unmount timer ends the sequence. Scroll is parked
// for the duration so gestures can't disturb the shot, then restored.
const SEQUENCE_MS = 4400;

export default function Splash() {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.scrollTo(0, 0);
    // NOTE: setGone only swaps render output to null — the component stays
    // mounted, so this cleanup does NOT run at sequence end. The lock must
    // be released inside the timer itself, or scroll stays dead forever.
    const id = window.setTimeout(() => {
      document.body.style.overflow = prev;
      setGone(true);
    }, SEQUENCE_MS);
    return () => {
      window.clearTimeout(id);
      document.body.style.overflow = prev;
    };
  }, []);
  if (gone) return null;
  return (
    <div className="splash" role="status" aria-label="OceanTwin">
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
