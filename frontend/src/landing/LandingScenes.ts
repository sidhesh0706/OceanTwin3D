import type { LandingScene } from '../experience/experienceState';

export interface LandingSceneDef {
  id: LandingScene;
  eyebrow: string;
  title: string;
  body: string;
  // Deepening blue grade applied over the viewport (0 = none).
  tint: number;
}

// Narrative copy only. All scientific values shown in the HUD come from
// the live API; nothing here fabricates measurements. Five compact beats:
// global ocean → depth → time/field → observations → enter.
export const LANDING_SCENES: LandingSceneDef[] = [
  {
    id: 'ocean',
    eyebrow: 'OCEANTWIN · GLOBAL OCEAN',
    title: 'The ocean is a 4D system.',
    body: 'Spatial. Vertical. Temporal. Scroll to approach the Earth and the model domain.',
    tint: 0,
  },
  {
    id: 'depth',
    eyebrow: 'DEPTH · WATER COLUMN',
    title: 'Surface, thermocline, deep ocean.',
    body: 'Ocean state changes through the water column. We descend through the model depth levels — display scale exaggerated for readability.',
    tint: 0.22,
  },
  {
    id: 'time',
    eyebrow: 'TIME · OCEAN STATE',
    title: 'The ocean state changes.',
    body: 'Temperature, salinity, chlorophyll and currents resolved in depth and time. Ranges below are the active dataset ranges.',
    tint: 0.1,
  },
  {
    id: 'observations',
    eyebrow: 'MODEL + IN-SITU OBSERVATIONS',
    title: 'Models propose. Measurements verify.',
    body: 'Argo floats and gliders hold the model accountable. Synthetic demonstration profiles — designed for future operational integration. Errors are calculated, never invented.',
    tint: 0,
  },
  {
    id: 'explorer',
    eyebrow: 'OCEANTWIN',
    title: 'Explore the ocean.',
    body: 'The narrative ends. The science continues — take control of the full explorer.',
    tint: 0,
  },
];

export const SCENE_INDEX: Record<LandingScene, number> = Object.fromEntries(
  LANDING_SCENES.map((s, i) => [s.id, i]),
) as Record<LandingScene, number>;
