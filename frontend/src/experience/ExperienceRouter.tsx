import { Suspense, lazy, useCallback, useRef, useState } from 'react';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { defaultSeed, type ExperienceMode, type ExplorerSeed } from './experienceState';
import '../landing/landing.css';

import Splash from './Splash';

const OceanTwinLanding = lazy(() => import('../landing/OceanTwinLanding'));
// Pre-mounted from app start, hidden behind the landing: its chunk and its
// data bootstrap complete during the cinematic, so the CTA reveals an
// already-live explorer. Its own Suspense fallback is null — a pending
// chunk must never swap the visible landing for a loading card.
const Explorer = lazy(() => import('../App'));

type Phase = ExperienceMode | 'leaving';

export default function ExperienceRouter() {
  const [phase, setPhase] = useState<Phase>(() => {
    const q = new URLSearchParams(window.location.search);
    // Direct explorer stays available: /?explore skips the cinematic.
    // /?intro (or default) plays splash → landing → explorer.
    if (q.has('explore')) return 'explorer';
    return 'landing';
  });
  const [seed, setSeed] = useState<ExplorerSeed>(defaultSeed);
  const entered = useRef(phase !== 'landing');

  // Reveal, not mount: the explorer is already live underneath. The short
  // fade only covers the landing's exit; entry happens exactly once.
  const enterExplorer = useCallback((next: ExplorerSeed) => {
    if (entered.current) return;
    entered.current = true;
    setSeed(next);
    window.scrollTo(0, 0);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setPhase('explorer');
      return;
    }
    setPhase('leaving');
    window.setTimeout(() => setPhase('explorer'), 300);
  }, []);

  return (
    <ErrorBoundary>
      <div className={`experience-explorer${phase === 'landing' ? ' is-preload' : ''}`}>
        <Suspense fallback={null}>
          <Explorer
            initialVariable={defaultSeed.variable}
            initialDepth={defaultSeed.depth}
            initialTime={defaultSeed.time}
            handoffSeed={phase === 'landing' ? null : seed}
            active={phase !== 'landing'}
          />
        </Suspense>
      </div>
      {phase !== 'explorer' && (
        <Suspense fallback={null}>
          <div className={`experience-landing${phase === 'leaving' ? ' is-leaving' : ''}`}>
            <OceanTwinLanding onEnterExplorer={enterExplorer} />
          </div>
        </Suspense>
      )}
      {phase === 'landing' && <Splash />}
    </ErrorBoundary>
  );
}
