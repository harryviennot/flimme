import { useLocalSearchParams } from 'expo-router';

import { PickSheet } from '@/components/screens/solo/pick-sheet';

/** The solo pick sheet (swipe.md#the-pick-sheet), a form sheet over the swipe screen. */
export default function RoomPickScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PickSheet roomId={id ?? ''} />;
}
