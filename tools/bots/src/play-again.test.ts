import { describe, expect, it } from 'vitest';

import { nextRoomJoin } from './play-again';

describe('nextRoomJoin', () => {
  it('joins the new room by its code, via play_again', () => {
    expect(nextRoomJoin({ room_id: 'r2', code: '123456', host_member_id: 'm1' })).toEqual({
      code: '123456',
      ref: 'r2',
      via: 'play_again',
    });
  });

  it('ignores a payload it does not understand', () => {
    expect(nextRoomJoin(null)).toBeNull();
    expect(nextRoomJoin({ code: 1 })).toBeNull();
  });
});
