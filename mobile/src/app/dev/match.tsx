import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { MatchOverlay, type MatchPlayer } from '@/components/screens/room/match-overlay';
import { fixturePosters } from '@/components/gallery';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { TopBar } from '@/components/ui/top-bar';
import { haptics } from '@/lib/haptics';
import { playSound } from '@/lib/sound';
import { duration } from '@/theme/motion';
import { useTranslation } from 'react-i18next';

const NAMES = ['Léa', 'Sam', 'Jo', 'Maya', 'Noé', 'Inès', 'Hugo', 'Zoé', 'Tom', 'Alix'] as const;
const COLORS = ['blue', 'green', 'gold', 'red', 'violet', 'teal'] as const;

const players = (count: number): MatchPlayer[] =>
  NAMES.slice(0, count).map((name, i) => ({
    id: name,
    name,
    color: COLORS[i % COLORS.length] ?? 'blue',
  }));

type Fixture = {
  label: string;
  title: string;
  count: number;
  likes: number;
};

const FIXTURES: Fixture[] = [
  { label: 'Unanimous, 3 players', title: 'Neon Harbor', count: 3, likes: 3 },
  { label: 'Majority, 10 players', title: 'Neon Harbor', count: 10, likes: 7 },
  {
    label: 'Long title, 6 players',
    title: 'The Extraordinarily Long Adventures of Captain Meridian and the Paper Comet',
    count: 6,
    likes: 6,
  },
];

// Plays the match overlay with fixture data, for the feel check (Dev menu, Tools). The haptic and
// the sound play too, as they do in a room.
export default function DevMatchScreen() {
  const { i18n } = useTranslation();
  const [playing, setPlaying] = useState<Fixture | null>(null);

  // The hold, as the room layout's controller does it.
  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => setPlaying(null), duration['match-hold']);
    return () => clearTimeout(timer);
  }, [playing]);

  if (!__DEV__) return <Redirect href="/" />;

  return (
    <>
      <Screen header={<TopBar title="Match overlay" onBack={() => router.back()} />}>
        <View className="flex-1 justify-center gap-4">
          <Text tone="secondary">
            Plays the overlay on fixture data. A tap goes on after 800 ms; it hands over by itself
            at 4 seconds.
          </Text>
          {FIXTURES.map((fixture) => (
            <Button
              key={fixture.label}
              label={fixture.label}
              variant="secondary"
              onPress={() => {
                haptics.match();
                void playSound('match');
                setPlaying(fixture);
              }}
            />
          ))}
        </View>
      </Screen>
      {playing ? (
        <MatchOverlay
          film={{ title: playing.title, meta: '2021 · 1 h 52' }}
          poster={fixturePosters.neonHarbor}
          count={{ likes: playing.likes, of: playing.count }}
          players={players(playing.count)}
          language={i18n.language}
          onContinue={() => setPlaying(null)}
        />
      ) : null}
    </>
  );
}
