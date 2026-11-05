import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';

import { fixturePosters, type GalleryEntry } from '../gallery';
import { MovieCard, type MovieCardProps, type StampKind } from './movie-card';

const film: Omit<MovieCardProps, 'flipped' | 'onFlip'> = {
  title: 'Last Reel at the Roxy',
  meta: '2021 · 1 h 52 · Drama · ★ 7.8',
  poster: fixturePosters.lastReel,
  reason: { label: 'Because you all liked Neon Harbor' },
  services: ['Netflix', 'Canal+'],
  back: {
    tmdbRating: '7.8',
    friendRating: { name: 'Jo', color: 'violet', rating: '4.5' },
    synopsis:
      'On the last night before the Roxy closes for good, its projectionist screens one final reel nobody remembers booking, and the whole town shows up to find out why.',
    director: 'Ines Mora',
    cast: 'Lior Ben-Ami, Paula Okafor, Sam Reyes, Ana Costa, and Tom Vance',
    services: [{ name: 'Netflix' }, { name: 'Canal+' }, { name: 'Arte' }],
    onTrailer: () => undefined,
  },
};

function Demo() {
  const [flipped, setFlipped] = useState(false);
  const [stamp, setStamp] = useState<StampKind | null>(null);
  return (
    <View className="gap-3">
      <MovieCard {...film} stamp={stamp} flipped={flipped} onFlip={() => setFlipped((f) => !f)} />
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
    'The swipe card. Tap to flip; the like, nope, seen it and super stamps show while it is dragged.',
  render: () => <Demo />,
};
