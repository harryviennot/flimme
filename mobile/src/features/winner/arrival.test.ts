import { arrivedLive, rememberRoomScreen } from './arrival';

describe('arrivedLive', () => {
  it('is true from the swipe or Final Cut screen when no overlay played', () => {
    rememberRoomScreen('a', 'swipe');
    rememberRoomScreen('b', 'final-cut');
    expect(arrivedLive('a', false)).toBe(true);
    expect(arrivedLive('b', false)).toBe(true);
  });

  it('is false under the match overlay, on a cold start, and from other screens', () => {
    rememberRoomScreen('c', 'swipe');
    expect(arrivedLive('c', true)).toBe(false);
    expect(arrivedLive('never-seen', false)).toBe(false);
    rememberRoomScreen('d', 'lobby');
    expect(arrivedLive('d', false)).toBe(false);
  });
});
