import type { RoomSeat } from '@flimme/contract';

import { formatList, serviceNames } from './names';
import { hostSeat, nextHost, presentSeats, seatChanges, seatedSeats, startGate } from './seats';

function seat(id: string, joined: string, extra: Partial<RoomSeat> = {}): RoomSeat {
  return {
    member_id: id,
    room_id: 'r1',
    role: 'guest',
    display_name: id.toUpperCase(),
    avatar_key: 'blue',
    provider_ids: [],
    joined_at: `2026-11-03T10:00:${joined}Z`,
    left_at: null,
    calibrated_at: null,
    done_at: null,
    swipe_count: 0,
    super_likes_left: 1,
    vetoes_left: 1,
    is_me: false,
    is_mine: false,
    ...extra,
  };
}

const host = seat('a', '01', { role: 'host' });
const sam = seat('b', '02');
const jo = seat('c', '03');
const none = new Set<string>();

describe('seatedSeats', () => {
  it('drops seats that left and keeps join order, then seat id', () => {
    const left = seat('d', '04', { left_at: '2026-11-03T10:05:00Z' });
    const tie = seat('0', '02');
    expect(seatedSeats([jo, left, sam, host, tie]).map((s) => s.member_id)).toEqual([
      'a',
      '0',
      'b',
      'c',
    ]);
    expect(seatedSeats(undefined)).toEqual([]);
  });

  it('finds the host and counts who is present', () => {
    const seated = seatedSeats([host, sam, jo]);
    expect(hostSeat(seated)?.member_id).toBe('a');
    expect(presentSeats(seated, new Set(['c']))).toHaveLength(2);
  });
});

describe('nextHost (M4.5 rule, Q11.3 and Q5.1)', () => {
  const seated = seatedSeats([host, sam, jo]);

  it('is the longest-seated other seat that is not away', () => {
    expect(nextHost(seated, 'a', none)?.member_id).toBe('b');
    expect(nextHost(seated, 'a', new Set(['b']))?.member_id).toBe('c');
  });

  it('is the longest-seated other seat when nobody else is present', () => {
    expect(nextHost(seated, 'a', new Set(['b', 'c']))?.member_id).toBe('b');
  });

  it('is nobody when the host is alone', () => {
    expect(nextHost(seatedSeats([host]), 'a', none)).toBeNull();
  });
});

describe('startGate', () => {
  const base = { minPlayers: 2, present: 3, awayNames: [], fresh: true, online: true };

  it('needs the mode minimum present', () => {
    expect(startGate({ ...base, present: 1 })).toEqual({ kind: 'need_players', need: 2 });
  });
  it('is ready, or names who is away and stays enabled', () => {
    expect(startGate(base)).toEqual({ kind: 'ready' });
    expect(startGate({ ...base, awayNames: ['Sam'] })).toEqual({ kind: 'away', names: ['Sam'] });
  });
  it('waits for a fresh room and a connection', () => {
    expect(startGate({ ...base, fresh: false })).toEqual({ kind: 'stale' });
    expect(startGate({ ...base, online: false })).toEqual({ kind: 'stale' });
  });
});

describe('seatChanges', () => {
  it('names who arrived and who left between two reads', () => {
    expect(seatChanges([host, sam], [host, jo])).toEqual({ joined: ['C'], left: ['B'] });
    expect(seatChanges([host], [host])).toEqual({ joined: [], left: [] });
  });
});

describe('service names', () => {
  const providers = [
    { provider_id: 8, name: 'Netflix', logo_path: null, display_priority: 1 },
    { provider_id: 337, name: 'Disney+', logo_path: null, display_priority: 2 },
  ];

  it('joins ids to names and skips unknown ids', () => {
    expect(serviceNames([8, 999, 337], providers)).toEqual(['Netflix', 'Disney+']);
    expect(serviceNames([8], undefined)).toEqual([]);
  });

  it('lists in the language', () => {
    expect(formatList(['A', 'B', 'C'], 'en')).toBe('A, B, and C');
    expect(formatList(['A', 'B'], 'fr')).toBe('A et B');
  });
});
