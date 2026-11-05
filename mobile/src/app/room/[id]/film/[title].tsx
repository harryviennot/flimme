import { router, useLocalSearchParams } from 'expo-router';

import { RunnerUpSheet } from '@/components/screens/winner/runner-up-sheet';

/** A runner-up's card back and where to watch it (winner.md#the-runner-up-sheet), a form sheet. */
export default function RoomFilmSheetRoute() {
  const { id, title } = useLocalSearchParams<{ id: string; title: string }>();
  return <RunnerUpSheet roomId={id ?? ''} titleId={Number(title)} onClose={() => router.back()} />;
}
