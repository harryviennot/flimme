// What Done does on the services sheet (lobby.md#the-services-sheet-done): the profile first, only
// when the selection changed, then the seat. Every answer becomes an outcome the sheet shows.
import type { SetMyProvidersResult, SetSeatPrefsResult } from '@flimme/contract';

export type SaveServicesOutcome =
  /** Saved, or nothing to save, or the game started meanwhile: close the sheet. */
  | { kind: 'close' }
  /** A bug on our side (the grid lists fewer than the cap): generic toast, a report, stays open. */
  | { kind: 'bug'; reason: string }
  /** A call failed: the warn toast, the sheet stays open. */
  | { kind: 'failed' };

export type SaveServicesDeps = {
  setMyProviders: (args: { provider_ids: number[] }) => Promise<SetMyProvidersResult>;
  setSeatPrefs: (args: { room_id: string; provider_ids: number[] }) => Promise<SetSeatPrefsResult>;
};

const sameSet = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((id) => b.includes(id));

export async function saveServices(
  input: { roomId: string; selection: number[]; start: number[] },
  deps: SaveServicesDeps,
): Promise<SaveServicesOutcome> {
  if (sameSet(input.selection, input.start)) return { kind: 'close' };
  try {
    const profile = await deps.setMyProviders({ provider_ids: input.selection });
    if (profile.status !== 'ok')
      return { kind: 'bug', reason: `set_my_providers:${profile.status}` };
    const seat = await deps.setSeatPrefs({
      room_id: input.roomId,
      provider_ids: input.selection,
    });
    if (seat.status === 'too_many') return { kind: 'bug', reason: 'set_seat_prefs:too_many' };
    return { kind: 'close' };
  } catch {
    return { kind: 'failed' };
  }
}
