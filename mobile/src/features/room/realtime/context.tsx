import { createContext, useContext, type ReactNode } from 'react';

import type { RoomRealtime } from './controller';

const RoomRealtimeContext = createContext<RoomRealtime | null>(null);

/** The room layout puts its channels here; the screens under it read them through the hooks. */
export function RoomRealtimeProvider({
  value,
  children,
}: {
  value: RoomRealtime | null;
  children: ReactNode;
}) {
  return <RoomRealtimeContext.Provider value={value}>{children}</RoomRealtimeContext.Provider>;
}

export const useRoomRealtime = () => useContext(RoomRealtimeContext);
