// What the host's two actions do (host-menu.md), without JSX: one call each, every answer turned
// into an outcome the screen shows. Nothing here logs a name, a code or an id.
import type { RemoveMemberAnswer, RemoveMemberResult, SetRoomLockedResult } from '@flimme/contract';

export type RemoveOutcome =
  /** `ok` or `not_in_room`: close the sheet, read the seats again. No message. */
  | { kind: 'seats' }
  /** `closed`: close the sheet, read the room again; the layout follows its state. */
  | { kind: 'room' }
  /** The call failed while online: the warn toast, the sheet stays. */
  | { kind: 'failed' };

/** One behaviour per answer; a test walks `REMOVE_MEMBER_ANSWERS` against it. */
export const REMOVE_OUTCOMES: Record<RemoveMemberAnswer, RemoveOutcome> = {
  ok: { kind: 'seats' },
  not_in_room: { kind: 'seats' },
  closed: { kind: 'room' },
};

export async function runRemove(
  removeMember: (args: { room_id: string; member_id: string }) => Promise<RemoveMemberResult>,
  args: { roomId: string; memberId: string },
): Promise<RemoveOutcome> {
  try {
    const answer = await removeMember({ room_id: args.roomId, member_id: args.memberId });
    return REMOVE_OUTCOMES[answer.status];
  } catch {
    // A network failure is not a bug; anything else was already reported by `src/api/`.
    return { kind: 'failed' };
  }
}

export type LockOutcome =
  /** `ok`: the toggle stays; every phone reads the room again on `room_locked`. */
  | { kind: 'saved' }
  /** `closed`: read the room again; the layout follows its state. */
  | { kind: 'room' }
  /** The call failed while online: the toggle flips back, the warn toast. */
  | { kind: 'failed' };

/** One behaviour per answer; a test walks `SET_ROOM_LOCKED_ANSWERS` against it. */
export const LOCK_OUTCOMES: Record<SetRoomLockedResult['status'], LockOutcome> = {
  ok: { kind: 'saved' },
  closed: { kind: 'room' },
};

export async function runSetLocked(
  setRoomLocked: (args: { room_id: string; locked: boolean }) => Promise<SetRoomLockedResult>,
  args: { roomId: string; locked: boolean },
): Promise<LockOutcome> {
  try {
    const answer = await setRoomLocked({ room_id: args.roomId, locked: args.locked });
    return LOCK_OUTCOMES[answer.status];
  } catch {
    return { kind: 'failed' };
  }
}
