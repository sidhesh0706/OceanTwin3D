import { Suspense, lazy, useState } from 'react';
import { ErrorBoundary } from '../components/ErrorBoundary';
import Splash from './Splash';
import './splash.css';
const Explorer = lazy(() => import('../App'));
// One persistent globe: the intro is an overlay, not another WebGL viewer.
export default function ExperienceRouter() {
  const [intro, setIntro] = useState(
    () => !new URLSearchParams(window.location.search).has('explore'),
  );
  return (
    <ErrorBoundary>
      <Splash />
      <Suspense
        fallback={
          <div className="init-screen" role="status">
            Opening OceanTwin…
          </div>
        }
      >
        <Explorer intro={intro} onEnter={() => setIntro(false)} />
      </Suspense>
    </ErrorBoundary>
  );
}
