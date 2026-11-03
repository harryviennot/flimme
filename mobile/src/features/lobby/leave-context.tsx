import { createContext, useContext } from 'react';

/** Asks the player to confirm, then leaves the room. Provided by the room layout's guard. */
export const LeaveContext = createContext<(() => void) | null>(null);

export function useAskToLeave(): () => void {
  const ask = useContext(LeaveContext);
  if (!ask) throw new Error('useAskToLeave needs the room layout above it.');
  return ask;
}
