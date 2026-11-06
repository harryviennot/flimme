import { cleanup, render, screen } from '@testing-library/react-native';
import { createElement } from 'react';

// The store scenes are dev-only: in a build where __DEV__ is false the route sends you home and
// never loads the scene code (docs/store/screenshots.md).

const mockParams: { scene?: string; lang?: string } = {};
jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    const { Text } = jest.requireActual('react-native');
    return <Text testID="redirect">{href}</Text>;
  },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@/components/screens/dev-store/store-scene', () => {
  throw new Error('the scene code must not load in a production build');
});

const globals = globalThis as unknown as { __DEV__: boolean };
const original = globals.__DEV__;
afterEach(() => {
  globals.__DEV__ = original;
});

function route() {
  // Required here so the test can switch __DEV__ first.
  return require('@/app/dev/store/[scene]').default as () => import('react').ReactElement | null;
}

describe('the store scene route', () => {
  it('sends you home in a production build, for every scene', async () => {
    globals.__DEV__ = false;
    const Scene = route();
    for (const scene of ['swipe', 'match', 'lobby', 'card-back', 'final-cut', 'recap']) {
      mockParams.scene = scene;
      mockParams.lang = 'fr';
      await render(createElement(Scene));
      expect(screen.getByTestId('redirect').props.children).toBe('/');
      await cleanup();
    }
  });

  it('sends you home for a scene that does not exist, in development too', async () => {
    globals.__DEV__ = true;
    mockParams.scene = 'nope';
    await render(createElement(route()));
    expect(screen.getByTestId('redirect').props.children).toBe('/');
  });
});
