// The frame meter (swipe.md, Q9.2): a dev tool that measures how smooth the swipe is while a
// card is dragged or flying. It is switched on at build time, so a release build can be
// measured without the dev menu: `EXPO_PUBLIC_FRAME_METER=1 npx expo run:ios --configuration
// Release`. A regression guard on the iPhone simulator (55 fps or more on average, under 5%
// janky frames over 50 swipes), not the low-end Android bar (M3.12).

export const FRAME_METER_ON = process.env.EXPO_PUBLIC_FRAME_METER === '1';

/** A frame is janky when it takes more than this many frame budgets. */
export const JANKY_FACTOR = 1.5;
/** The frame budget at 60 frames per second, in milliseconds. */
export const FRAME_BUDGET_MS = 1000 / 60;

export type FrameStats = { frames: number; totalMs: number; janky: number };

export const EMPTY_STATS: FrameStats = { frames: 0, totalMs: 0, janky: 0 };

/** One frame's time into the running numbers. */
export function addFrame(stats: FrameStats, frameMs: number): FrameStats {
  'worklet';
  return {
    frames: stats.frames + 1,
    totalMs: stats.totalMs + frameMs,
    janky: stats.janky + (frameMs > FRAME_BUDGET_MS * JANKY_FACTOR ? 1 : 0),
  };
}

/** Average frames per second, and the share of janky frames (0 to 100). */
export function summarize(stats: FrameStats): { fps: number; jankyPercent: number } {
  if (stats.frames === 0 || stats.totalMs === 0) return { fps: 0, jankyPercent: 0 };
  return {
    fps: (stats.frames * 1000) / stats.totalMs,
    jankyPercent: (stats.janky * 100) / stats.frames,
  };
}
