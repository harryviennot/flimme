import { tokens } from '@/theme/generated/tokens';

// The rules of how the swipe card feels, one named constant each. Placeholders, tuned at the
// first feel check (docs/design/screens/swipe.md#starting-values-q93 and
// docs/design/moments.md#the-swipe). The functions are worklets: they run on the UI thread
// while a finger is down, and plain JavaScript in tests.

export type Direction = 'right' | 'left' | 'up';
export type Lines = { x: number; y: number };

/** The sideways commit line: this share of the screen's width from the middle. */
export const COMMIT_LINE_X = 0.3;
/** The upward commit line: this share of the screen's height. */
export const COMMIT_LINE_Y = 0.18;
/** An upward drag counts as "up" within this many degrees of straight up. */
export const UP_ANGLE_DEG = 30;
/** Points per second toward an answer that throws the card before the line. */
export const THROW_SPEED = 800;
/** Points the finger moves before a touch becomes a drag (below it, it is a tap). */
export const TOUCH_SLOP = 10;
/** The card behind at rest, as a share of full size; it grows to 1 at the commit line. */
export const SECOND_CARD_SCALE = 0.95;
/** The third card at rest. */
export const THIRD_CARD_SCALE = 0.9;
/** How far the cards behind sit lower, in points (translate-y-2 and translate-y-4). */
export const STACK_STEP = 8;
/** The card pivots around a point this share of its height below its middle. */
export const PIVOT = 0.75;
/** Where a thrown card ends, in screen widths or heights from the middle. */
export const THROW_DISTANCE = 1.3;
/** A button's throw slides the card this far in Reduce Motion, in screen widths. */
export const REDUCED_SLIDE = 0.12;
/** A throw carries this share of the finger's speed along the other axis, in seconds. */
export const CARRY_X = 0.2;
export const CARRY_Y = 0.15;
/** Seen it with the rewatch question lifts the card this many points (translate-y-6). */
export const SEEN_LIFT = 24;
/** Dwell is only counted up to this many ms. */
export const MAX_DWELL_MS = 10 * 60 * 1000;
/** A card sits still this long before the loading card's "still dealing" line. */
export const SLOW_LOADING_MS = 10_000;
/** The matching button lights once the drag is this far toward the line. */
export const LIGHT_FROM = 0.15;
/** The card 1 lean goes this share of the commit line. */
export const LEAN_SHARE = 1 / 3;

const TAN_UP = Math.tan((UP_ANGLE_DEG * Math.PI) / 180);

export function commitLines(width: number, height: number): Lines {
  'worklet';
  return { x: width * COMMIT_LINE_X, y: height * COMMIT_LINE_Y };
}

/** Which answer a drag (or a velocity) points at, or null for down and for no movement. */
export function directionOf(dx: number, dy: number): Direction | null {
  'worklet';
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  if (dy < 0 && adx <= ady * TAN_UP) return 'up';
  if (dy > 0 && ady > adx) return null;
  if (dx > 0) return 'right';
  if (dx < 0) return 'left';
  return null;
}

/** 0 at rest to 1 at the commit line, toward the answer the drag points at. */
export function progressOf(dx: number, dy: number, lines: Lines): number {
  'worklet';
  const direction = directionOf(dx, dy);
  if (direction === null) return 0;
  const share = direction === 'up' ? -dy / lines.y : Math.abs(dx) / lines.x;
  return Math.min(1, Math.max(0, share));
}

export type Release = { dx: number; dy: number; vx: number; vy: number };

/** What letting go does: the answer to throw, or null to bring the card back. */
export function decideRelease(release: Release, lines: Lines): Direction | null {
  'worklet';
  const { dx, dy, vx, vy } = release;
  const dragged = directionOf(dx, dy);
  if (dragged !== null && progressOf(dx, dy, lines) >= 1) return dragged;

  const flick = directionOf(vx, vy);
  if (flick === null) return null;
  const speed = flick === 'up' ? -vy : flick === 'right' ? vx : -vx;
  if (speed < THROW_SPEED) return null;
  // A flick back toward the middle from the other side is not a throw.
  if (flick === 'right' && dx < 0) return null;
  if (flick === 'left' && dx > 0) return null;
  if (flick === 'up' && dy > 0) return null;
  return flick;
}

/** The tilt in degrees for a sideways drag: the token's tilt at the line, never past the max. */
export function tiltFor(dx: number, lines: Lines): number {
  'worklet';
  const tilt = (dx / lines.x) * tokens.rotation['card-tilt'];
  const max = tokens.rotation['card-tilt-max'];
  return Math.max(-max, Math.min(max, tilt));
}
