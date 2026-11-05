import { duration } from '@/theme/motion';

import {
  createMatchController,
  LANDED_MS,
  SKIP_AFTER_MS,
  type MatchControllerDeps,
} from './controller';

function setup(overrides: Partial<MatchControllerDeps> = {}) {
  const shown = new Set<string>();
  const deps = {
    isShown: jest.fn((id: string) => shown.has(id)),
    markShown: jest.fn((id: string) => void shown.add(id)),
    onStart: jest.fn(),
    screenReaderOn: jest.fn(() => false),
    ...overrides,
  };
  const controller = createMatchController('r1', deps);
  return { controller, deps, shown };
}

const event = { title_id: 7, kind: 'unanimous' as const, likes: 3, of: 3, decided: true };

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('the match overlay controller', () => {
  it('starts on the first signal and fires haptic and sound once', () => {
    const { controller, deps } = setup();
    controller.signal({ title_id: 7 });
    expect(controller.get()).toEqual({ title_id: 7, likes: null, of: null });
    expect(deps.onStart).toHaveBeenCalledTimes(1);
    // The other signal for the same film does not restart it, and fills in the count.
    controller.signal(event);
    expect(deps.onStart).toHaveBeenCalledTimes(1);
    expect(controller.get()).toEqual({ title_id: 7, likes: 3, of: 3 });
  });

  it('shows one overlay when the event comes first and the own answer second', () => {
    const { controller, deps } = setup();
    controller.signal(event);
    controller.signal({ title_id: 7, decided: true });
    expect(deps.onStart).toHaveBeenCalledTimes(1);
    expect(controller.get()).toEqual({ title_id: 7, likes: 3, of: 3 });
  });

  it('ignores a second match for a room already decided', () => {
    const { controller, deps } = setup();
    controller.signal(event);
    controller.signal({ ...event, title_id: 9 });
    expect(controller.get()?.title_id).toBe(7);
    controller.finish();
    controller.signal({ ...event, title_id: 9 });
    expect(controller.get()).toBeNull();
    expect(deps.onStart).toHaveBeenCalledTimes(1);
  });

  it('ignores a match that is not decided', () => {
    const { controller } = setup();
    controller.signal({ ...event, decided: false });
    expect(controller.get()).toBeNull();
  });

  it('shows nothing for a room already marked as shown', () => {
    const { controller, deps, shown } = setup();
    shown.add('r1');
    controller.signal(event);
    controller.reread('done', [
      {
        room_id: 'r1',
        title_id: 7,
        kind: 'unanimous',
        like_count: 3,
        present_count: 3,
        pick_order: 1,
        created_at: '',
      },
    ]);
    expect(controller.get()).toBeNull();
    expect(deps.onStart).not.toHaveBeenCalled();
  });

  it('marks the room once the avatars have landed, and hands over at the hold', () => {
    const { controller, deps } = setup();
    const changes = jest.fn();
    controller.subscribe(changes);
    controller.signal(event);
    jest.advanceTimersByTime(LANDED_MS - 1);
    expect(deps.markShown).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(deps.markShown).toHaveBeenCalledWith('r1');
    jest.advanceTimersByTime(duration['match-hold'] - LANDED_MS - 1);
    expect(controller.get()).not.toBeNull();
    jest.advanceTimersByTime(1);
    expect(controller.get()).toBeNull();
  });

  it('a tap in the first 800 ms does not skip; later it does, and marks the room', () => {
    const { controller, deps } = setup();
    controller.signal(event);
    jest.advanceTimersByTime(SKIP_AFTER_MS - 1);
    controller.skip();
    expect(controller.get()).not.toBeNull();
    jest.advanceTimersByTime(1);
    controller.skip();
    expect(controller.get()).toBeNull();
    expect(deps.markShown).toHaveBeenCalledWith('r1');
  });

  it('waits for the button with a screen reader on', () => {
    const { controller } = setup({ screenReaderOn: () => true });
    controller.signal(event);
    jest.advanceTimersByTime(duration['match-hold'] * 3);
    expect(controller.get()).not.toBeNull();
    controller.skip();
    expect(controller.get()).toBeNull();
  });

  it('a re-read that finds a decided room not yet shown plays the overlay once', () => {
    const { controller, deps } = setup();
    const row = {
      room_id: 'r1',
      title_id: 7,
      kind: 'majority' as const,
      like_count: 2,
      present_count: 3,
      pick_order: 1,
      created_at: '',
    };
    controller.reread('swiping', [row]);
    expect(controller.get()).toBeNull();
    controller.reread('done', []);
    expect(controller.get()).toBeNull();
    controller.reread('done', [{ ...row, pick_order: null }]);
    expect(controller.get()).toBeNull();
    controller.reread('done', [row]);
    expect(controller.get()).toEqual({ title_id: 7, likes: 2, of: 3 });
    controller.reread('done', [row]);
    expect(deps.onStart).toHaveBeenCalledTimes(1);
    controller.finish();
    controller.reread('done', [row]);
    expect(controller.get()).toBeNull();
    expect(deps.onStart).toHaveBeenCalledTimes(1);
  });

  it('plays nothing for a finale pick, by event or by re-read; a unanimous one still plays', () => {
    const { controller, deps } = setup();
    controller.signal({ ...event, kind: 'finale' });
    expect(controller.get()).toBeNull();
    controller.reread('done', [
      {
        room_id: 'r1',
        title_id: 7,
        kind: 'finale',
        like_count: 0,
        present_count: 3,
        pick_order: 1,
        created_at: '',
      },
    ]);
    expect(controller.get()).toBeNull();
    expect(deps.onStart).not.toHaveBeenCalled();
    controller.signal({ ...event, kind: 'unanimous' });
    expect(controller.get()).not.toBeNull();
  });

  it('stop cancels the timers and shows nothing more', () => {
    const { controller, deps } = setup();
    controller.signal(event);
    controller.stop();
    jest.advanceTimersByTime(duration['match-hold'] * 2);
    expect(deps.markShown).toHaveBeenCalledWith('r1');
    expect(controller.get()).toBeNull();
    controller.signal({ ...event, title_id: 9 });
    expect(controller.get()).toBeNull();
  });
});
