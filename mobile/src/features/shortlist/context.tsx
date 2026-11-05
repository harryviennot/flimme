import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';

import { EMPTY_SNAPSHOT, type ShortlistController, type ShortlistSnapshot } from './controller';

// The room layout owns the room's shortlist controller; the swipe screen and its top bar read it
// from here. Without a provider (a test, a gallery) the shortlist is empty and no beat plays.

const ShortlistContext = createContext<ShortlistController | null>(null);

export function ShortlistProvider({
  value,
  children,
}: {
  value: ShortlistController | null;
  children: ReactNode;
}) {
  return <ShortlistContext.Provider value={value}>{children}</ShortlistContext.Provider>;
}

const NEVER = () => () => {};
const EMPTY = () => EMPTY_SNAPSHOT;

/** The shortlist and the beat now playing. */
export function useShortlistView(): ShortlistSnapshot {
  const controller = useContext(ShortlistContext);
  return useSyncExternalStore(
    controller ? controller.subscribe : NEVER,
    controller ? controller.getSnapshot : EMPTY,
    EMPTY,
  );
}

/** Whether the room layout keeps its route where it is (the third match's beat). */
export function useShortlistHold(controller: ShortlistController | null): boolean {
  return useSyncExternalStore(
    controller ? controller.subscribe : NEVER,
    () => (controller ? controller.getSnapshot().holding : false),
    () => false,
  );
}
