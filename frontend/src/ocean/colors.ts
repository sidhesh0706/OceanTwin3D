import { Color } from 'three';
import type { Variable } from '../types';
export const palettes: Record<Variable, string[]> = {
  temperature: ['#263d88', '#247ba6', '#54b9be', '#a8d9bd', '#f0dda1', '#ee9b65', '#d5544f'],
  salinity: ['#161f56', '#3b4c90', '#667fb0', '#9bc2c7', '#d3e6d0', '#f1f0cb'],
  chlorophyll: ['#171e48', '#254b68', '#257b80', '#53a58a', '#a1cb78', '#f0e99e'],
  current_speed: ['#202344', '#414474', '#79518b', '#b9628b', '#e9958f', '#f7d6a6'],
};
const colors = Object.fromEntries(
  Object.entries(palettes).map(([v, list]) => [v, list.map((c) => new Color(c))]),
) as Record<Variable, Color[]>;
export function dataColor(
  value: number,
  variable: Variable,
  min: number,
  max: number,
  target = new Color(),
) {
  const palette = colors[variable];
  const t = Math.max(0, Math.min(1, (value - min) / (max - min || 1))) * (palette.length - 1);
  const idx = Math.min(palette.length - 2, Math.floor(t));
  return target.copy(palette[idx]).lerp(palette[idx + 1], t - idx);
}
export const gradient = (v: Variable) => `linear-gradient(90deg,${palettes[v].join(',')})`;
