import '@/i18n';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderRouter, screen, waitFor } from 'expo-router/testing-library';
import type { ReactNode } from 'react';

// What the screens of wave 2 reach for: the api, the guest session, the connection and the
// on-device store. M4.17 and M4.7 add their own answers to these mocks.
jest.mock('@/api', () => ({
  api: {
    myProfile: jest.fn(async () => ({
      id: 'u1',
      display_name: '',
      avatar_key: 'default',
      country: 'FR',
      language: 'en',
      created_at: '2026-11-03T00:00:00Z',
    })),
    joinRoom: jest.fn(async () => ({ status: 'not_found' })),
    updateProfile: jest.fn(async () => ({ status: 'ok', display_name: 'Léa', avatar_key: 'blue' })),
  },
}));
jest.mock('@/features/session', () => ({
  startSession: jest.fn(async () => ({ status: 'ok', userId: 'u1', isNew: true })),
  useSession: () => ({ status: 'ok', userId: 'u1', isNew: true }),
  useSessionFailed: () => false,
}));
jest.mock('@/features/network', () => ({ useOnline: () => true, watchNetwork: jest.fn() }));
jest.mock('@/lib/storage', () => ({
  storage: { getItemSync: () => null, setItemSync: jest.fn() },
}));

function Providers({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

jest.mock('@/lib/sound', () => ({ setSoundEnabled: jest.fn(), playSound: jest.fn() }));
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => undefined),
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Rigid: 'rigid', Soft: 'soft' },
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));

// Every first-release route opens (app-structure.md#screens-and-navigation). The real
// layouts and screens are rendered; the root layout (fonts, Sentry, updates) is not.
/* eslint-disable @typescript-eslint/no-require-imports */
const routes = {
  index: require('@/app/index').default,
  welcome: require('@/app/welcome').default,
  name: require('@/app/name').default,
  home: require('@/app/home').default,
  join: require('@/app/join/index').default,
  'join/[code]': require('@/app/join/[code]').default,
  host: require('@/app/host/index').default,
  settings: require('@/app/settings').default,
  'room/[id]/_layout': require('@/app/room/[id]/_layout').default,
  'room/[id]/lobby': require('@/app/room/[id]/lobby').default,
  'room/[id]/invite': require('@/app/room/[id]/invite').default,
  'room/[id]/services': require('@/app/room/[id]/services').default,
  'room/[id]/swipe': require('@/app/room/[id]/swipe').default,
  'room/[id]/final-cut': require('@/app/room/[id]/final-cut').default,
  'room/[id]/winner': require('@/app/room/[id]/winner').default,
  'room/[id]/recap': require('@/app/room/[id]/recap').default,
  'room/[id]/closed': require('@/app/room/[id]/closed').default,
  'dev/index': require('@/app/dev/index').default,
};
/* eslint-enable @typescript-eslint/no-require-imports */

const paths = [
  '/welcome',
  '/name',
  '/home',
  '/join',
  '/join/123456',
  '/host',
  '/settings',
  '/room/abc/lobby',
  '/room/abc/invite',
  '/room/abc/services',
  '/room/abc/swipe',
  '/room/abc/final-cut',
  '/room/abc/winner',
  '/room/abc/recap',
  '/room/abc/closed',
  '/dev',
];

describe('routes', () => {
  it.each(paths)('%s opens', async (path) => {
    await renderRouter(routes, { initialUrl: path, wrapper: Providers });
    expect(screen).toHavePathname(path);
    expect(screen.queryByText(/unmatched route/i)).toBeNull();
  });

  it('sends a fresh install from the root to the welcome screen', async () => {
    await renderRouter(routes, { initialUrl: '/', wrapper: Providers });
    await waitFor(() => expect(screen).toHavePathname('/welcome'));
  });
});
