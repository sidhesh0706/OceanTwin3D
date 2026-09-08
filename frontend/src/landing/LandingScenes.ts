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
// the live API; nothing here fabricates measurements.
export const LANDING_SCENES: LandingSceneDef[] = [
  {
    id: 'orbit',
    eyebrow: 'OCEANTWIN',
    title: 'Understand the ocean in 4D.',
    body: 'Interactive 3D ocean data, models and observations. Scroll to explore.',
    tint: 0,
  },
  {
    id: 'earth',
    eyebrow: 'SCENE 02 · EARTH APPROACH',
    title: 'From planet to region.',
    body: 'Ocean processes become meaningful when viewed at regional scale. We descend toward the Indian subcontinent.',
    tint: 0,
  },
  {
    id: 'india',
    eyebrow: 'SCENE 03 · GEOGRAPHY',
    title: 'The Indian coastline.',
    body: 'Land geometry from Natural Earth. The model domain spans the Arabian Sea, the Bay of Bengal and the open Indian Ocean.',
    tint: 0,
  },
  {
    id: 'indian-ocean',
    eyebrow: 'SCENE 04 · CURRENT FIELD',
    title: 'An ocean in motion.',
    body: 'Surface velocity from the numerical model. Streaks follow model eastward and northward currents; motion is accelerated for visibility.',
    tint: 0,
  },
  {
    id: 'observations',
    eyebrow: 'SCENE 05 · OBSERVATIONS',
    title: 'The measurement network.',
    body: 'Argo floats, gliders and biogeochemical platforms hold the model accountable. One profile is highlighted; the rest remain spatial markers.',
    tint: 0,
  },
  {
    id: 'surface',
    eyebrow: 'SCENE 06 · SURFACE',
    title: 'The surface is only the beginning.',
    body: 'Warm surface water hides a three-dimensional structure. We now descend through the model depth levels.',
    tint: 0.08,
  },
  {
    id: 'dive',
    eyebrow: 'SCENE 07 · DIVE',
    title: 'Descend the water column.',
    body: 'Temperature falls with depth through the thermocline into the deep ocean. Depth levels are the model layers, exaggerated for readability.',
    tint: 0.3,
  },
  {
    id: 'ocean-field',
    eyebrow: 'SCENE 08 · OCEAN FIELD',
    title: 'Reveal the invisible ocean.',
    body: 'Temperature, salinity, currents and chlorophyll resolved in depth and time. Ranges below are the active dataset ranges.',
    tint: 0.12,
  },
  {
    id: 'comparison',
    eyebrow: 'SCENE 09 · MODEL VS OBSERVATION',
    title: 'Trust, but verify.',
    body: 'The model is interpolated to the observation location and depths. Errors are calculated from the displayed pairs — never invented.',
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
