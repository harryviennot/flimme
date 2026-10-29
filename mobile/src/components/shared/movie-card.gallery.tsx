import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';

import { fixturePosters, type GalleryEntry } from '../gallery';
import { MovieCard, type MovieCardProps } from './movie-card';

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
    cast: 'Lior Ben-Ami, Paula Okafor',
    onTrailer: () => undefined,
  },
};

function Demo() {
  const [flipped, setFlipped] = useState(false);
  const [stamp, setStamp] = useState<'like' | 'nope' | null>(null);
  return (
    <View className="gap-3">
      <MovieCard {...film} stamp={stamp} flipped={flipped} onFlip={() => setFlipped((f) => !f)} />
      <View className="flex-row gap-2">
        <Button
          label="Like"
          variant="secondary"
          size="s"
          onPress={() => setStamp(stamp === 'like' ? null : 'like')}
        />
        <Button
          label="Nope"
          variant="secondary"
          size="s"
          onPress={() => setStamp(stamp === 'nope' ? null : 'nope')}
        />
        <Button label="Flip" variant="ghost" size="s" onPress={() => setFlipped((f) => !f)} />
      </View>
    </View>
  );
}

export const gallery: GalleryEntry = {
  name: 'Movie card',
  tier: 'shared',
  description: 'The swipe card. Tap to flip; the stamps show while it is dragged.',
  render: () => <Demo />,
};
