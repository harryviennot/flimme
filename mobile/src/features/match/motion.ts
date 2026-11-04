import { duration } from '@/theme/motion';

// The overlay's choices between its two ways of moving (match.md#motion-haptics-sound): the
// full sequence, and Reduce Motion (a fade at full size, no chase, no stagger).

/** The poster starts at about the swipe card's width: the screen less its 20-point margins. */
export const CARD_MARGIN = 40;

export type MatchMotion = {
  /** The poster's starting scale and opacity; it ends at 1 and 1. */
  posterStart: { scale: number; opacity: number };
  chasing: boolean;
  /** Delay before the avatar at this index appears. */
  avatarDelay: (index: number) => number;
  /** Delay before the count, the film and the button appear. */
  detailsDelay: (playerCount: number) => number;
};

export function matchMotion(reduced: boolean, screenWidth: number): MatchMotion {
  if (reduced) {
    return {
      posterStart: { scale: 1, opacity: 0 },
      chasing: false,
      // Avatars, count and film fade in together.
      avatarDelay: () => 0,
      detailsDelay: () => 0,
    };
  }
  return {
    posterStart: { scale: (screenWidth - CARD_MARGIN) / screenWidth, opacity: 1 },
    chasing: true,
    avatarDelay: (index) => duration.celebrate + index * duration.instant,
    detailsDelay: (playerCount) => duration.celebrate + playerCount * duration.instant,
  };
}
