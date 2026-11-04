import { useLocalSearchParams } from 'expo-router';

import { ClosedScreen } from '@/components/screens/closed/closed-screen';

export default function RoomClosedScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ClosedScreen roomId={id ?? ''} />;
}
