import { useLocalSearchParams } from 'expo-router';

import { FinalCutRoom } from '@/components/screens/final-cut/final-cut-room';

/** The Final Cut (docs/design/screens/final-cut.md), shown while the room is `finale`. */
export default function RoomFinalCutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <FinalCutRoom roomId={id ?? ''} />;
}
