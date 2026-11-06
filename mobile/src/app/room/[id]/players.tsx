import { useLocalSearchParams } from 'expo-router';

import { PlayersSheet } from '@/components/screens/swipe/players-sheet';

/** The players sheet over the swipe screen (docs/design/screens/swipe.md#the-players-sheet). */
export default function RoomPlayersSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PlayersSheet roomId={id ?? ''} />;
}
