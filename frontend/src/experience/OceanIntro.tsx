import { ArrowRight } from 'lucide-react';
import './ocean-intro.css';
export default function OceanIntro({
  ready,
  synthetic,
  onEnter,
}: {
  ready: boolean;
  synthetic: boolean;
  onEnter: () => void;
}) {
  return (
    <section className="ocean-intro" aria-label="Welcome to OceanTwin">
      <header className="intro-header">
        <span className="intro-wordmark">
          OCEAN<span>TWIN</span>
        </span>
        <span className="intro-edition">4D OCEAN EXPLORATION</span>
      </header>
      <div className="intro-copy">
        <p className="intro-eyebrow">ONE EARTH. MANY DEPTHS.</p>
        <h1>
          Explore beneath
          <br />
          <em>the surface.</em>
        </h1>
        <p className="intro-description">
          From the globe to the water column. Discover ocean currents, explore depth and time, and
          compare instrument profiles.
        </p>
        <button className="intro-enter" onClick={onEnter}>
          Explore the ocean <ArrowRight size={19} />
        </button>
        <p className="intro-status" role="status">
          {ready
            ? 'Earth ready · drag to rotate, scroll to zoom'
            : 'Loading Earth imagery… you can enter while it loads'}
        </p>
        <div className="intro-dimensions">
          <span>
            01 <b>Locate</b>
          </span>
          <span>
            02 <b>Descend</b>
          </span>
          <span>
            03 <b>Compare</b>
          </span>
        </div>
      </div>
      <footer className="intro-footer">
        <span>{synthetic ? 'SYNTHETIC DEMO DATA' : 'LOCAL MODEL DATA'}</span>
        <span>NASA Earth imagery · Scientific model overlays</span>
      </footer>
    </section>
  );
}
