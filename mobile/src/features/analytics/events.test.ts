import { track, trackWhenRoomKnown } from '@/lib/analytics';

import { trackJoinAttempt } from './events';

jest.mock('@/lib/analytics', () => ({ track: jest.fn(), trackWhenRoomKnown: jest.fn() }));
jest.mock('expo-router', () => ({ useSegments: () => [] }));

beforeEach(() => jest.clearAllMocks());

describe('trackJoinAttempt', () => {
  it('waits for the room when a seat was taken', () => {
    trackJoinAttempt('code', 'ok');
    expect(trackWhenRoomKnown).toHaveBeenCalledWith('join:attempt_finish', {
      via: 'code',
      status: 'ok',
    });
    expect(track).not.toHaveBeenCalled();
  });

  it.each(['not_found', 'closed', 'full', 'starting', 'rate_limited', 'removed'])(
    'sends a refusal at once: %s',
    (status) => {
      trackJoinAttempt('link', status);
      expect(track).toHaveBeenCalledWith('join:attempt_finish', { via: 'link', status });
      expect(trackWhenRoomKnown).not.toHaveBeenCalled();
    },
  );

  it('calls an answer this build does not know unknown', () => {
    trackJoinAttempt('rejoin', 'from_the_future');
    expect(track).toHaveBeenCalledWith('join:attempt_finish', {
      via: 'rejoin',
      status: 'unknown',
    });
  });
});
