import { Easing, FadeIn, FadeInDown, FadeOut, FadeOutUp, ZoomIn } from 'react-native-reanimated';

import { tokens } from './generated/tokens';

// How things move. Durations and easings are the Figma's Motion tokens; springs are
// added here for anything a finger drives. Reanimated skips animations when the system's
// Reduce Motion is on (ReduceMotion.System is the default), so nothing here checks it.

const bezier = ([x1, y1, x2, y2]: readonly number[]) =>
  Easing.bezier(x1 ?? 0, y1 ?? 0, x2 ?? 1, y2 ?? 1);

/** Milliseconds: instant 80 (taps, toggles), fast 150 (presses), base 250 (card return,
 * sheet fade), slow 400 (sheet slide, card fly-out), celebrate 800 (match reveal). */
export const duration = tokens.duration;

export const easing = {
  /** Most transitions. */
  standard: bezier(tokens.easing.standard),
  /** Cards leaving the screen. */
  exit: bezier(tokens.easing.exit),
  /** The overshoot for stamps, buttons popping back and the match reveal. */
  arcade: bezier(tokens.easing.arcade),
};

/** Ready-made timing configs for withTiming. */
export const timing = {
  press: { duration: duration.fast, easing: easing.standard },
  release: { duration: duration.fast, easing: easing.arcade },
  toggle: { duration: duration.instant, easing: easing.standard },
  base: { duration: duration.base, easing: easing.standard },
  flip: { duration: duration.base, easing: easing.standard },
  exit: { duration: duration.slow, easing: easing.exit },
  celebrate: { duration: duration.celebrate, easing: easing.arcade },
};

/** Springs for gestures, for withSpring. */
export const spring = {
  /** A dragged card returning to the middle. */
  card: { damping: 18, stiffness: 180, mass: 1 },
  /** A small element settling (a chip, a knob). */
  snappy: { damping: 22, stiffness: 420, mass: 0.6 },
  /** Celebrations: avatars popping in, the winner poster. */
  bouncy: { damping: 10, stiffness: 200, mass: 0.8 },
};

/** Entering and exiting presets, so lists, toasts and overlays move the same way. */
export const layout = {
  toastIn: FadeInDown.duration(duration.base).easing(easing.standard),
  toastOut: FadeOutUp.duration(duration.fast).easing(easing.exit),
  fadeIn: FadeIn.duration(duration.base),
  fadeOut: FadeOut.duration(duration.fast),
  popIn: ZoomIn.duration(duration.base).easing(easing.arcade),
};
