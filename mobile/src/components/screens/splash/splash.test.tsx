import { ApiError, type MyProfile } from '@flimme/contract';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { api } from '@/api';
import Index from '@/app/index';
import i18n from '@/i18n';
import { keptRoomStore } from '@/features/room/kept-room';
import { saveCachedProfile } from '@/features/profile';
import { startSession } from '@/features/session';
import { duration } from '@/theme/motion';

import { SLOW_AFTER_MS } from '@/features/launch/use-launch';

import { SplashView } from './splash-view';

let mockSession: unknown = null;
let mockFailed = false;
let mockOnline = true;
let mockReduceMotion = false;
const mockMemory = new Map<string, string>();

jest.mock('@/api', () => ({
  api: { myProfile: jest.fn(), updateProfile: jest.fn(), joinRoom: jest.fn() },
}));
jest.mock('@/features/session', () => ({
  startSession: jest.fn(() => Promise.resolve()),
  useSession: () => mockSession,
  useSessionFailed: () => mockFailed,
}));
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  return new Proxy(actual, {
    get: (target, key) => (key === 'useReducedMotion' ? () => mockReduceMotion : target[key]),
  });
});
jest.mock('@/features/network', () => ({ useOnline: () => mockOnline }));
jest.mock('@/lib/storage', () => ({
  storage: {
    getItemSync: (key: string) => mockMemory.get(key) ?? null,
    setItemSync: (key: string, value: string) => void mockMemory.set(key, value),
    removeItemSync: (key: string) => void mockMemory.delete(key),
  },
}));
jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: 'fr', regionCode: 'FR' }],
}));
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text } = require('react-native');
  return { Redirect: ({ href }: { href: string }) => <Text>{['redirect', href].join(':')}</Text> };
});

const myProfile = jest.mocked(api.myProfile);
const updateProfile = jest.mocked(api.updateProfile);
const joinRoom = jest.mocked(api.joinRoom);

const named: MyProfile = {
  id: 'u1',
  display_name: 'Léa',
  avatar_key: 'blue',
  country: 'FR',
  language: 'fr',
  created_at: '2026-11-03T00:00:00Z',
};
const unnamed: MyProfile = { ...named, display_name: '' };
const ok = { status: 'ok', userId: 'u1', isNew: false };

const frame = { x: 0, y: 0, width: 375, height: 812 };

function tree() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <SafeAreaProvider initialMetrics={{ frame, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <QueryClientProvider client={client}>
        <Index />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

async function renderSplash() {
  const view = await render(tree());
  await act(async () => {
    jest.advanceTimersByTime(10);
  });
  return view;
}

beforeEach(async () => {
  jest.useFakeTimers();
  mockSession = ok;
  mockFailed = false;
  mockOnline = true;
  mockReduceMotion = false;
  mockMemory.clear();
  myProfile.mockReset();
  joinRoom.mockReset();
  keptRoomStore.getState().forget();
  updateProfile
    .mockReset()
    .mockResolvedValue({ status: 'ok', display_name: 'Léa', avatar_key: 'blue' });
  jest.mocked(startSession).mockClear();
  await i18n.changeLanguage('en');
});

afterEach(() => jest.useRealTimers());

describe('the splash routing', () => {
  it('replaces with Welcome when the profile has no name', async () => {
    myProfile.mockResolvedValue(unnamed);
    await renderSplash();
    expect(screen.getByText('redirect:/welcome')).toBeTruthy();
  });

  it('replaces with Home when the profile has a name', async () => {
    myProfile.mockResolvedValue(named);
    await renderSplash();
    expect(screen.getByText('redirect:/home')).toBeTruthy();
  });

  it('goes to Home offline from the cached named profile', async () => {
    saveCachedProfile(named);
    myProfile.mockRejectedValue(new ApiError('network', 'my_profile', 'offline'));
    await renderSplash();
    expect(screen.getByText('redirect:/home')).toBeTruthy();
  });
});

describe('the kept room', () => {
  const kept = { id: 'room-1', code: '482913' };
  const room = () => keptRoomStore.getState().room;
  beforeEach(() => {
    keptRoomStore.getState().keep(kept);
    myProfile.mockResolvedValue(named);
  });

  it('rejoins with the code and the id, then replaces with the state screen', async () => {
    joinRoom.mockResolvedValue({
      status: 'ok',
      room_id: 'room-1',
      member_id: 'm1',
      state: 'swiping',
      rejoined: true,
    });
    await renderSplash();
    expect(joinRoom).toHaveBeenCalledWith({ code: '482913', ref: 'room-1', via: 'rejoin' });
    expect(screen.getByText('redirect:/room/room-1/swipe')).toBeTruthy();
    expect(room()).toEqual(kept);
  });

  it.each(['closed', 'not_found', 'full', 'in_finale'])(
    'goes Home and forgets the room on %s',
    async (status) => {
      joinRoom.mockResolvedValue({ status } as never);
      await renderSplash();
      expect(screen.getByText('redirect:/home')).toBeTruthy();
      expect(room()).toBeNull();
    },
  );

  it.each([
    ['rate_limited', () => joinRoom.mockResolvedValue({ status: 'rate_limited' } as never)],
    ['a thrown call', () => joinRoom.mockRejectedValue(new Error('down'))],
  ])('goes Home and keeps the room on %s', async (_n, arrange) => {
    arrange();
    await renderSplash();
    expect(screen.getByText('redirect:/home')).toBeTruthy();
    expect(room()).toEqual(kept);
  });

  it('goes Home and keeps the room offline, with no call', async () => {
    mockOnline = false;
    await renderSplash();
    expect(screen.getByText('redirect:/home')).toBeTruthy();
    expect(joinRoom).not.toHaveBeenCalled();
    expect(room()).toEqual(kept);
  });

  it('goes to Welcome without a name, with no call', async () => {
    myProfile.mockResolvedValue(unnamed);
    await renderSplash();
    expect(screen.getByText('redirect:/welcome')).toBeTruthy();
    expect(joinRoom).not.toHaveBeenCalled();
  });

  it('shows the slow tagline while the call takes over 3 seconds', async () => {
    joinRoom.mockReturnValue(new Promise(() => {}));
    await renderSplash();
    await act(async () => {
      jest.advanceTimersByTime(SLOW_AFTER_MS);
    });
    expect(screen.getByText('Lighting up the marquee…')).toBeTruthy();
  });
});

describe('the hand-off view', () => {
  it('runs no entering animation when everything is ready within duration.base', async () => {
    myProfile.mockResolvedValue(named);
    await renderSplash();
    expect(screen.queryByTestId('splash-tagline')).toBeNull();
    expect(screen.queryByTestId('splash-spotlight')).toBeNull();
  });

  it('brings the spotlight and tagline in after duration.base', async () => {
    mockSession = null;
    await renderSplash();
    expect(screen.queryByTestId('splash-tagline')).toBeNull();
    await act(async () => {
      jest.advanceTimersByTime(duration.base);
    });
    expect(screen.getByTestId('splash-tagline').props.entering).toBeDefined();
    expect(screen.getByText('Swipe together · Watch tonight')).toBeTruthy();
  });

  it('says it is still working after 3 seconds', async () => {
    mockSession = null;
    await renderSplash();
    await act(async () => {
      jest.advanceTimersByTime(SLOW_AFTER_MS);
    });
    expect(screen.getByText('Lighting up the marquee…')).toBeTruthy();
  });

  it('is labelled for screen readers', async () => {
    mockSession = null;
    await renderSplash();
    expect(screen.getByLabelText('Flimme, Loading')).toBeTruthy();
  });

  it('runs no fades under Reduce Motion', async () => {
    mockReduceMotion = true;
    await render(<SplashView />);
    await act(async () => {
      jest.advanceTimersByTime(duration.base);
    });
    expect(screen.getByTestId('splash-tagline').props.entering).toBeUndefined();
    expect(screen.getByTestId('splash-spotlight').props.entering).toBeUndefined();
  });
});

describe('the splash problems', () => {
  it('shows the offline state when offline with nothing cached, and Retry starts again', async () => {
    mockSession = { status: 'offline' };
    await renderSplash();
    expect(screen.getByText("You're offline")).toBeTruthy();
    await fireEvent.press(screen.getByText('Try again'));
    expect(startSession).toHaveBeenCalledTimes(1);
  });

  it('retries by itself when the connection comes back', async () => {
    mockSession = { status: 'offline' };
    mockOnline = false;
    const view = await renderSplash();
    expect(startSession).not.toHaveBeenCalled();
    mockOnline = true;
    await view.rerender(tree());
    expect(startSession).toHaveBeenCalledTimes(1);
  });

  it('focuses the title of an error state', async () => {
    const focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent');
    mockSession = { status: 'refused' };
    await renderSplash();
    expect(focus).toHaveBeenCalled();
  });

  it('shows signInFailed with Retry when the sign-in was refused', async () => {
    mockSession = { status: 'refused' };
    await renderSplash();
    expect(screen.getByText("We couldn't get you started")).toBeTruthy();
    await fireEvent.press(screen.getByText('Try again'));
    expect(startSession).toHaveBeenCalledTimes(1);
  });

  it('shows signInFailed when starting the session threw', async () => {
    mockSession = null;
    mockFailed = true;
    await renderSplash();
    expect(screen.getByText("We couldn't get you started")).toBeTruthy();
  });

  it('shows signInFailed when the profile fails for another reason', async () => {
    myProfile.mockRejectedValue(new ApiError('unexpected', 'my_profile', 'boom'));
    await renderSplash();
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.getByText("We couldn't get you started")).toBeTruthy();
  });

  it('shows the offline state when the profile cannot be read for lack of a network', async () => {
    myProfile.mockRejectedValue(new ApiError('network', 'my_profile', 'offline'));
    await renderSplash();
    expect(screen.getByText("You're offline")).toBeTruthy();
  });
});

describe('the silent device sync', () => {
  it('sends the country while the profile has none', async () => {
    myProfile.mockResolvedValue({ ...named, country: null });
    await renderSplash();
    expect(updateProfile).toHaveBeenCalledWith({ country: 'FR' });
  });

  it('sends no country when one is set', async () => {
    myProfile.mockResolvedValue(named);
    await renderSplash();
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it('sends the language when it differs from the app', async () => {
    myProfile.mockResolvedValue({ ...named, language: 'en' });
    await renderSplash();
    expect(updateProfile).toHaveBeenCalledWith({ language: 'fr' });
  });

  it.each([
    ['a refusal', () => updateProfile.mockResolvedValue({ status: 'invalid_name' })],
    ['an error', () => updateProfile.mockRejectedValue(new Error('down'))],
  ])('leaves the routing alone after %s and does not retry', async (_name, arrange) => {
    arrange();
    myProfile.mockResolvedValue({ ...named, language: 'en' });
    await renderSplash();
    await act(async () => {
      jest.advanceTimersByTime(SLOW_AFTER_MS * 2);
    });
    expect(screen.getByText('redirect:/home')).toBeTruthy();
    expect(updateProfile).toHaveBeenCalledTimes(1);
  });
});
