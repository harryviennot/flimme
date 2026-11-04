import { useLocalSearchParams } from 'expo-router';

import { WinnerRoom } from '@/components/screens/winner/winner-room';

export default function RoomWinnerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <WinnerRoom roomId={id ?? ''} />;
}
