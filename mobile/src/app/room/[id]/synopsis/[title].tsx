import { router, useLocalSearchParams } from 'expo-router';

import { SynopsisSheet } from '@/components/screens/swipe/synopsis-sheet';

/** The whole synopsis of the card on top (swipe.md#the-synopsis-sheet), a form sheet. */
export default function RoomSynopsisSheetRoute() {
  const { title } = useLocalSearchParams<{ id: string; title: string }>();
  return <SynopsisSheet titleId={Number(title)} onClose={() => router.back()} />;
}
