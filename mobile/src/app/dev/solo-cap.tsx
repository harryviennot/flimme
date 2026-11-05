import type { NextCard } from '@flimme/contract';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';

import { CapCard, OutOfFilmsCard } from '@/components/screens/solo/end-cards';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { TopBar } from '@/components/ui/top-bar';
import type { SessionEntry } from '@/features/solo/session';

// The solo end cards with fixture data (Dev menu, Tools): staging can't lower the daily cap, so the
// cap card and the out of films card are looked at here, with and without likes.
const card = (id: number) => ({ title_id: id, title: `Film ${id}`, poster_path: null }) as NextCard;
const entry = (id: number): SessionEntry => ({ card: card(id), kind: 'like', seq: id });

type Fixture = { label: string; kind: 'cap' | 'films'; likes: number };
const FIXTURES: Fixture[] = [
  { label: 'Cap card, 5 likes', kind: 'cap', likes: 5 },
  { label: 'Cap card, no like', kind: 'cap', likes: 0 },
  { label: 'Out of films, 1 like', kind: 'films', likes: 1 },
  { label: 'Out of films, no like', kind: 'films', likes: 0 },
];

export default function DevSoloCapScreen() {
  const screen = useWindowDimensions();
  const [shown, setShown] = useState<Fixture>(FIXTURES[0]!);
  if (!__DEV__) return <Redirect href="/" />;
  const size = { width: screen.width - 40, height: Math.min(screen.height * 0.6, 560) };
  const likes = Array.from({ length: shown.likes }, (_, i) => entry(i + 1));
  const props = {
    size,
    screenWidth: screen.width,
    likes,
    imageBase: undefined,
    onPick: () => undefined,
    onMyFilms: () => undefined,
  };
  return (
    <Screen header={<TopBar title="Solo end cards" onBack={() => router.back()} />}>
      <View className="flex-row flex-wrap gap-2 pb-4">
        {FIXTURES.map((f) => (
          <Button
            key={f.label}
            label={f.label}
            size="s"
            variant={f === shown ? 'primary' : 'secondary'}
            onPress={() => setShown(f)}
          />
        ))}
      </View>
      <View className="items-center">
        {shown.kind === 'cap' ? (
          <CapCard {...props} onHost={() => undefined} />
        ) : (
          <OutOfFilmsCard {...props} />
        )}
      </View>
    </Screen>
  );
}
