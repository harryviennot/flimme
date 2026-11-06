import { pendingSaves } from './pending';
import { savedSession } from './saved-session';

/** The sheet's own call went through: the session and the waiting list follow it. */
export function recordSaved(titleId: number, saved: boolean): void {
  savedSession.getState().set(titleId, saved);
  const waiting = pendingSaves.getState().items.find((i) => i.title_id === titleId);
  if (waiting) pendingSaves.getState().settle(waiting);
}
