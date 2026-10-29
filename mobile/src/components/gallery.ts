import type { ReactNode } from 'react';

// Every component in ui/ and shared/ has a <name>.gallery.tsx next to it that exports a
// `gallery` entry, listed in gallery-registry.ts. The gallery screen (/dev/gallery, in
// development builds) shows them all in every state; scripts/check-gallery.mjs fails when
// one is missing.

export type GalleryEntry = {
  name: string;
  tier: 'ui' | 'shared';
  /** One line: what it's for, from the Figma's description. */
  description: string;
  render: () => ReactNode;
};

/** The Figma's fictional posters, for galleries and store screenshots only. */
export const fixturePosters = {
  lastReel: require('@/assets/posters/last-reel-at-the-roxy.png'),
  neonHarbor: require('@/assets/posters/neon-harbor.png'),
  paperComet: require('@/assets/posters/the-paper-comet.png'),
  midnightMatinee: require('@/assets/posters/midnight-matinee.png'),
  southboundSummer: require('@/assets/posters/southbound-summer.png'),
  signalAndNoise: require('@/assets/posters/signal-and-noise.png'),
  quietOrchard: require('@/assets/posters/the-quiet-orchard.png'),
  grandPrix: require('@/assets/posters/grand-prix-of-nowhere.png'),
};
