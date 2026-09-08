import { LANDING_SCENES } from './LandingScenes';
import type { LandingScene } from '../experience/experienceState';

interface Props {
  active: LandingScene;
  progress: number;
  onJump: (scene: LandingScene) => void;
}

// Minimal scroll progress rail. Dots jump the narrative (which flies the
// camera); the bar reflects overall scroll progress.
export default function LandingProgress({ active, progress, onJump }: Props) {
  return (
    <nav className="landing-progress" aria-label="Narrative progress">
      <div className="landing-progress-track">
        <i style={{ height: `${Math.round(progress * 100)}%` }} />
      </div>
      <div className="landing-progress-dots">
        {LANDING_SCENES.map((s) => (
          <button
            key={s.id}
            className={s.id === active ? 'active' : ''}
            aria-label={`Go to ${s.id}`}
            title={s.id}
            onClick={() => onJump(s.id)}
          />
        ))}
      </div>
    </nav>
  );
}
