// The top bar's player stack without JSX (swipe.md#the-player-stack): how many discs fit the
// width, which ones hide behind "+N", and the counts the stack's label speaks. Never anything
// about answers (rule 6).

/** A disc and its wrapper are 32 points wide (28 for the avatar, 2 for the ring each side). */
export const DISC = 32;
/** `gap-1` between spaced discs. */
export const GAP = 4;
/** Overlapped discs sit 8 points over the one before. */
export const OVERLAP = 8;
/** The stack's width when nothing has been measured yet: the smallest phone's. */
export const DEFAULT_STACK_WIDTH = 167;

export type StackLayout = {
  mode: 'spaced' | 'overlapped';
  /** The ids drawn as discs, in seat order. */
  visible: string[];
  /** How many seats the "+N" disc stands for. 0: no "+N" disc. */
  hidden: number;
};

const spacedWidth = (n: number) => n * DISC + Math.max(n - 1, 0) * GAP;
const overlappedWidth = (n: number) => (n === 0 ? 0 : DISC + (n - 1) * (DISC - OVERLAP));

/** How many places (discs, "+N" included) fit the width when overlapped. At least one. */
function overlappedPlaces(width: number): number {
  return Math.max(1, Math.floor((width - DISC) / (DISC - OVERLAP)) + 1);
}

/**
 * What the stack draws at this width: spaced while every disc fits, then overlapped, then a
 * "+N" disc in the last place. The own seat is never hidden: if it would be, it takes the last
 * visible place. Seats keep the order they come in, so nothing jumps when a seat's state changes.
 */
export function stackLayout(
  width: number,
  seatIds: readonly string[],
  myId: string | undefined,
): StackLayout {
  const total = seatIds.length;
  if (spacedWidth(total) <= width) return { mode: 'spaced', visible: [...seatIds], hidden: 0 };
  if (overlappedWidth(total) <= width) {
    return { mode: 'overlapped', visible: [...seatIds], hidden: 0 };
  }
  // The "+N" disc takes a place, so the discs get one less.
  const kept = Math.max(1, overlappedPlaces(width) - 1);
  const visible = seatIds.slice(0, kept);
  if (myId !== undefined && seatIds.includes(myId) && !visible.includes(myId)) {
    visible[visible.length - 1] = myId;
  }
  return { mode: 'overlapped', visible, hidden: total - visible.length };
}

/** The numbers the stack's screen reader label gives: players, how many others are done and away. */
export function stackCounts(seats: readonly { done: boolean; away: boolean; isMe: boolean }[]): {
  total: number;
  done: number;
  away: number;
} {
  return {
    total: seats.length,
    done: seats.filter((seat) => seat.done && !seat.isMe).length,
    away: seats.filter((seat) => seat.away && !seat.isMe).length,
  };
}
