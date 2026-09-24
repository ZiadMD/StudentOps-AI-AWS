import type { Look } from './engine';
import type { ExpressionId } from './expressions';
import { clamp, easings } from './math';

export const YAW_MAX = 28;
export const PITCH_MAX = 20;
export const TURN_TIME = 0.35;

export const HUMEURS: readonly ExpressionId[] = [
  'surpris',
  'heureux',
  'hilare',
  'excite',
  'fier',
  'blase'
];

export type GazeScript = (t: number) => Look;

export const TOUR_TIME = 1.5;

export const tourLook: GazeScript = (t) => ({
  yaw: 0,
  pitch: 0,
  mix: 0,
  spin: 360 * (1 - easings.easeInOutCubic(clamp(t / TOUR_TIME))),
  wander: 1
});

export interface Aim {
  /** Horizontal deviation from center, -1 to 1 (negative = left, 0 = center, positive = right) */
  nx: number;
  /** Vertical deviation from center, -1 to 1 (negative = up, 0 = center, positive = down) */
  ny: number;
  /** Progress of gaze arrival/transition, 0 to 1 */
  tour: number;
  /** false = no active pointer: head stays oriented with natural wander */
  pointer: boolean;
}

export function lookTarget({ nx, ny, tour, pointer }: Aim): Look {
  return {
    yaw: nx * YAW_MAX,
    pitch: -ny * PITCH_MAX,
    mix: tour,
    spin: 0,
    wander: pointer ? 0 : 1
  };
}
