import type { Variable } from '../types';

// Top-level product mode. The landing sequence introduces capabilities;
// the explorer is the existing scientific application and source of truth.
export type ExperienceMode = 'landing' | 'explorer';

// Cinematic landing scenes, in scroll order. The final scene hands off
// to the explorer; it never duplicates explorer controls.
export type LandingScene =
  | 'orbit'
  | 'earth'
  | 'india'
  | 'indian-ocean'
  | 'observations'
  | 'surface'
  | 'dive'
  | 'ocean-field'
  | 'comparison'
  | 'explorer';

// Small seed carried across the LANDING → EXPLORER transition so the
// explorer opens on the narrative's variable/depth/time instead of
// resetting. Everything else (dataset, overlays, rendering config)
// boots from the explorer's own defaults and backend state.
export interface ExplorerSeed {
  variable: Variable;
  depth: number;
  time: number;
}

export const defaultSeed: ExplorerSeed = {
  variable: 'temperature',
  depth: 0,
  time: 0,
};

export function readEnv(name: string): string | null {
  const env = (import.meta as unknown as { env?: Record<string, string> }).env;
  const value = env?.[name];
  return value && value.length ? value : null;
}
