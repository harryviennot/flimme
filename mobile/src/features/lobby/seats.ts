// The lobby's rules about seats, without JSX (docs/design/screens/lobby.md): who shows, who is
// present, who the next host is, who just arrived or left.
import type { RoomSeat } from '@flimme/contract';

const byJoin = (a: RoomSeat, b: RoomSeat) =>
  a.joined_at < b.joined_at
    ? -1
    : a.joined_at > b.joined_at
      ? 1
      : a.member_id < b.member_id
        ? -1
        : a.member_id > b.member_id
          ? 1
          : 0;

/** The seats that show: not left, in join order (`joined_at`, then `member_id`). */
export function seatedSeats(seats: readonly RoomSeat[] | undefined): RoomSeat[] {
  return (seats ?? []).filter((seat) => seat.left_at === null).sort(byJoin);
}

/** Seated and not away: what the ticket's count, the Start helper and the leave alert use. */
export function presentSeats(seated: readonly RoomSeat[], away: ReadonlySet<string>): RoomSeat[] {
  return seated.filter((seat) => !away.has(seat.member_id));
}

export function hostSeat(seated: readonly RoomSeat[]): RoomSeat | null {
  return seated.find((seat) => seat.role === 'host') ?? null;
}

/**
 * Who becomes host if the host leaves (M4.5's rule, Q11.3 and Q5.1): the longest-seated other
 * seat that is not away; with nobody present, the longest-seated other seat; with nobody else
 * seated, no one. Ties go to the lower seat id (`seated` is already in that order).
 */
export function nextHost(
  seated: readonly RoomSeat[],
  hostMemberId: string,
  away: ReadonlySet<string>,
): RoomSeat | null {
  const others = seated.filter((seat) => seat.member_id !== hostMemberId);
  return others.find((seat) => !away.has(seat.member_id)) ?? others[0] ?? null;
}

export type StartGate =
  /** Fewer present players than the mode needs: disabled, with the helper. */
  | { kind: 'need_players'; need: number }
  /** The room is not fresh (offline or reconnecting): disabled, the banner says why. */
  | { kind: 'stale' }
  /** Some seats are away: enabled, the helper names them. */
  | { kind: 'away'; names: string[] }
  | { kind: 'ready' };

/** Whether the host can start, and what the line under the button says. */
export function startGate(input: {
  minPlayers: number;
  present: number;
  awayNames: string[];
  fresh: boolean;
  online: boolean;
}): StartGate {
  if (input.present < input.minPlayers) return { kind: 'need_players', need: input.minPlayers };
  if (!input.fresh || !input.online) return { kind: 'stale' };
  if (input.awayNames.length > 0) return { kind: 'away', names: input.awayNames };
  return { kind: 'ready' };
}

/** Names of the seats that arrived or left between two reads, to announce. */
export function seatChanges(
  before: readonly RoomSeat[],
  after: readonly RoomSeat[],
): { joined: string[]; left: string[] } {
  const was = new Map(before.map((seat) => [seat.member_id, seat]));
  const is = new Map(after.map((seat) => [seat.member_id, seat]));
  return {
    joined: after.filter((seat) => !was.has(seat.member_id)).map((seat) => seat.display_name),
    left: before.filter((seat) => !is.has(seat.member_id)).map((seat) => seat.display_name),
  };
}
