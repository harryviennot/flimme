import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

import { fixturePosters, type GalleryEntry } from '../gallery';
import { MovieCard, type MovieCardProps, type StampKind } from './movie-card';

const film: Omit<MovieCardProps, 'flipped' | 'onFlip'> = {
  title: 'Last Reel at the Roxy',
  meta: '2021 · 1 h 52 · Drama · ★ 7.8',
  poster: fixturePosters.lastReel,
  reason: { label: 'Because you all liked Neon Harbor' },
  services: ['Netflix', 'Canal+'],
  back: {
    meta: '2021 · 1 h 52',
    tmdbRating: '7.8',
    synopsis:
      'On the last night before the Roxy closes for good, its projectionist screens one final reel nobody remembers booking, and the whole town shows up to find out why.',
    director: 'Ines Mora',
    cast: 'Lior Ben-Ami, Paula Okafor, Sam Reyes, Ana Costa, and Tom Vance',
    services: [{ name: 'Netflix' }, { name: 'Canal+' }, { name: 'Arte' }],
    onTrailer: () => undefined,
  },
};

// A long overview with "Read more", six services (so "+n" shows beside the Trailer button), and a
// logo that fails to load (its initials show).
const long: Omit<MovieCardProps, 'flipped' | 'onFlip'> = {
  ...film,
  back: {
    ...film.back,
    synopsis: `${film.back.synopsis} ${film.back.synopsis} ${film.back.synopsis}`,
    services: [
      { name: 'Netflix' },
      { name: 'Canal+' },
      { name: 'Arte', logo: 'https://invalid.test/missing.png' },
      { name: 'Disney+' },
      { name: 'Prime Video' },
      { name: 'Apple TV' },
    ],
    onReadMore: () => undefined,
  },
};

// No services: no logos and no credit, the Trailer button alone at the right.
const bare: Omit<MovieCardProps, 'flipped' | 'onFlip'> = {
  ...film,
  services: [],
  back: { ...film.back, services: [], tmdbRating: undefined },
};

function Demo({ card, start = false }: { card: typeof film; start?: boolean }) {
  const [flipped, setFlipped] = useState(start);
  const [stamp, setStamp] = useState<StampKind | null>(null);
  const [saved, setSaved] = useState(false);
  return (
    <View className="gap-3">
      <MovieCard
        {...card}
        stamp={stamp}
        flipped={flipped}
        onFlip={() => setFlipped((f) => !f)}
        bookmark={{ saved, onToggle: () => setSaved((s) => !s) }}
      />
      <View className="flex-row flex-wrap gap-2">
        {(['like', 'nope', 'seen', 'super'] as const).map((kind) => (
          <Button
            key={kind}
            label={kind}
            variant="secondary"
            size="s"
            onPress={() => setStamp(stamp === kind ? null : kind)}
          />
        ))}
        <Button label="Flip" variant="ghost" size="s" onPress={() => setFlipped((f) => !f)} />
      </View>
    </View>
  );
}

export const gallery: GalleryEntry = {
  name: 'Movie card',
  tier: 'shared',
  description:
    'The swipe card. Tap to flip; the like, nope, seen it and super stamps show while it is dragged. The bookmark (top left, front and back) saves the film for Later: empty, then filled. The back: the poster crop and fade, the score in the meta line, "Read more" under a cut synopsis, one row of logos with "+n".',
  render: () => (
    <View className="gap-6">
      <Demo card={film} />
      <Text variant="mono-eyebrow" tone="secondary">
        Long synopsis, six services, a logo that fails
      </Text>
      <Demo card={long} start />
      <Text variant="mono-eyebrow" tone="secondary">
        No services, no score
      </Text>
      <Demo card={bare} start />
      <Text variant="mono-eyebrow" tone="secondary">
        Still back (film sheet): long synopsis shown whole, the card grows
      </Text>
      <MovieCard {...long} still flipped />
    </View>
  ),
};
