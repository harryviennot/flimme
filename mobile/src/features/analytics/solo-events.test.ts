import { track, trackWhenRoomKnown } from '@/lib/analytics';

import {
  trackCapShow,
  trackDeckCap,
  trackCheckpointView,
  trackMyFilmsGrid,
  trackSoloPick,
  trackSoloStart,
} from './solo-events';

jest.mock('@/lib/analytics', () => ({
  ...jest.requireActual('@/lib/analytics-core'),
  track: jest.fn(),
  trackWhenRoomKnown: jest.fn(),
}));

beforeEach(() => jest.clearAllMocks());

describe('the solo events', () => {
  it('the session start waits for the room and carries the setup', () => {
    trackSoloStart({ serviceCount: 3, runtimeMax: 120 });
    trackSoloStart({ serviceCount: 1, runtimeMax: null });
    expect(trackWhenRoomKnown).toHaveBeenNthCalledWith(1, 'solo:session_start', {
      service_count: 3,
      has_time_budget: true,
    });
    expect(trackWhenRoomKnown).toHaveBeenNthCalledWith(2, 'solo:session_start', {
      service_count: 1,
      has_time_budget: false,
    });
  });

  it('the checkpoint carries the card count and a bucketed like count', () => {
    trackCheckpointView('r1', 40, 12);
    trackCheckpointView('r1', 40, 12);
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('solo:checkpoint_view', {
      card_count: 40,
      like_count: '10_19',
    });
  });

  it('the pick carries the answered cards', () => {
    trackSoloPick(27);
    expect(track).toHaveBeenCalledWith('solo:pick_submit', { card_count: 27 });
  });

  it('the cap card carries its placement', () => {
    trackCapShow('play');
    expect(track).toHaveBeenCalledWith('solo:cap_show', { placement: 'play' });
  });

  it('the deck cap counts once per room', () => {
    trackDeckCap('r1');
    trackDeckCap('r1');
    trackDeckCap('r2');
    expect(track).toHaveBeenCalledTimes(2);
    expect(track).toHaveBeenCalledWith('solo:cap_show', { placement: 'deck' });
  });

  it('the grid view buckets the count and has no filter on Seen', () => {
    trackMyFilmsGrid({ segment: 'liked', filter: 'friends', count: 4, hasMore: false });
    trackMyFilmsGrid({ segment: 'seen', filter: 'solo', count: 0, hasMore: false });
    trackMyFilmsGrid({ segment: 'liked', filter: 'all', count: 60, hasMore: true });
    expect(track).toHaveBeenNthCalledWith(1, 'my_films:grid_view', {
      segment: 'liked',
      filter: 'friends',
      film_count: '1_4',
    });
    expect(track).toHaveBeenNthCalledWith(2, 'my_films:grid_view', {
      segment: 'seen',
      filter: 'none',
      film_count: '0',
    });
    expect(track).toHaveBeenNthCalledWith(3, 'my_films:grid_view', {
      segment: 'liked',
      filter: 'all',
      film_count: '20_plus',
    });
  });
});
