// The card back's layout rules (swipe.md#the-card-back-reworked), kept apart from the JSX so
// tests call them directly. Nothing here waits on the network: the back reads the card's payload.

/** A service logo's square, in points (`size-8`). */
export const LOGO_SIZE = 32;
/** The gap between logo squares (`gap-1.5`). */
export const LOGO_GAP = 6;

/** The font scale above which the title and meta leave the header (the service grid's threshold). */
export function isLargeText(fontScale: number): boolean {
  return fontScale > 1.3;
}

/** How many squares a row of this width holds. 0 until the row is measured. */
export function logoSlots(width: number): number {
  if (width <= 0) return 0;
  return Math.floor((width + LOGO_GAP) / (LOGO_SIZE + LOGO_GAP));
}

/**
 * The logos to draw and how many are left behind "+n". When they don't all fit, the last square
 * is the overflow one, so it takes a slot and the services it hides are counted from there.
 */
export function splitServices<T>(services: T[], slots: number): { shown: T[]; hidden: number } {
  if (slots <= 0) return { shown: [], hidden: 0 };
  if (services.length <= slots) return { shown: services, hidden: 0 };
  const shown = services.slice(0, slots - 1);
  return { shown, hidden: services.length - shown.length };
}

/**
 * The synopsis's line limit. `room` is the height it has, `line` one line's height, `full` the
 * line count of the whole text unclipped. A "Read more" link takes its own line below the text
 * box, so a cut text only has to show the link: the box shrinks and the cut stays a cut.
 */
export function synopsisFit(args: { room: number; line: number; full: number }): {
  lines: number | undefined;
  cut: boolean;
} {
  const { room, line, full } = args;
  if (room <= 0 || line <= 0) return { lines: undefined, cut: false };
  const fits = Math.max(1, Math.floor(room / line + 0.01));
  return { lines: fits, cut: full > fits };
}
