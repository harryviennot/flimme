import { describe, expect, it } from 'vitest';

import type { RoomEventPayloads } from './realtime';

describe('state_changed payload', () => {
  it('is a state alone, or a state with the reason a start went back to the lobby', () => {
    const plain: RoomEventPayloads['state_changed'] = { state: 'swiping' };
    const back: RoomEventPayloads['state_changed'] = {
      state: 'lobby',
      reason: 'too_few_films',
      eligible: 12,
    };
    expect(plain.reason).toBeUndefined();
    expect(back).toEqual({ state: 'lobby', reason: 'too_few_films', eligible: 12 });
  });
});

describe('next_room payload', () => {
  it('names the new room and the host by seat id, with no name', () => {
    const payload: RoomEventPayloads['next_room'] = {
      room_id: 'r1',
      code: '123456',
      host_member_id: 'm1',
    };
    expect(Object.keys(payload).sort()).toEqual(['code', 'host_member_id', 'room_id']);
  });
});
