import { useLocalSearchParams } from 'expo-router';

import { RecapSheet } from '@/components/screens/recap/recap-sheet';

/** The recap share card (recap.md), a form sheet over the winner screen. */
export default function RoomRecapScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RecapSheet roomId={id ?? ''} />;
}
