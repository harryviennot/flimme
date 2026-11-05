import { track, trackWhenRoomKnown } from '@/lib/analytics';

import {
  trackJoinAttempt,
  trackLinkOpen,
  trackNameSubmit,
  trackRoomCreated,
  trackServicesSaved,
} from './events';

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

describe('the other first release moments', () => {
  it('reports the name screen once as onboarding, organic or by invite', () => {
    trackNameSubmit({ source: 'organic', hasAvatar: true });
    trackNameSubmit({ source: 'invite', hasAvatar: false });
    expect(track).toHaveBeenNthCalledWith(1, 'onboarding:name_submit', {
      has_avatar: true,
      source: 'organic',
    });
    expect(track).toHaveBeenNthCalledWith(2, 'onboarding:name_submit', {
      has_avatar: false,
      source: 'invite',
    });
  });

  it('reports nothing when a profile is only edited', () => {
    trackNameSubmit({ editing: true, source: 'organic', hasAvatar: true });
    expect(track).not.toHaveBeenCalled();
  });

  it('reports a link opening with only whether it had a room reference', () => {
    trackLinkOpen(true);
    trackLinkOpen(false);
    expect(track).toHaveBeenNthCalledWith(1, 'join:link_open', { has_room_ref: true });
    expect(track).toHaveBeenNthCalledWith(2, 'join:link_open', { has_room_ref: false });
  });

  it('reports the room opened, and its services, once the room layout has the cap', () => {
    trackRoomCreated({ serviceCount: 4, runtimeMax: 105 });
    expect(trackWhenRoomKnown).toHaveBeenCalledTimes(2);
    expect(trackWhenRoomKnown).toHaveBeenNthCalledWith(1, 'room:create_finish', {
      mode: 'quick_match',
      mood_count: 0,
      has_time_budget: true,
      seen_rule: 'hide_seen',
      quality: 'standard',
      service_count: 4,
    });
    expect(trackWhenRoomKnown).toHaveBeenNthCalledWith(2, 'lobby:services_submit', {
      service_count: 4,
      step: 'room_setup',
    });
    expect(track).not.toHaveBeenCalled();
  });

  it('says no time budget when the host chose none', () => {
    trackRoomCreated({ serviceCount: 1, runtimeMax: null });
    expect(jest.mocked(trackWhenRoomKnown).mock.calls[0]?.[1]).toMatchObject({
      has_time_budget: false,
    });
  });

  it('reports the services sheet only when the selection changed', () => {
    trackServicesSaved([8, 119], [119, 8]);
    expect(track).not.toHaveBeenCalled();
    trackServicesSaved([8], [8, 119]);
    expect(track).toHaveBeenCalledWith('lobby:services_submit', {
      service_count: 2,
      step: 'lobby',
    });
  });
});
