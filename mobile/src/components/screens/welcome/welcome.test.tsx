import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import Welcome from '@/app/welcome';
import i18n from '@/i18n';

let mockReduceMotion = false;

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  return new Proxy(actual, {
    get: (target, key) => (key === 'useReducedMotion' ? () => mockReduceMotion : target[key]),
  });
});
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => undefined),
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Rigid: 'rigid', Soft: 'soft' },
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));

const frame = { x: 0, y: 0, width: 375, height: 812 };

async function renderWelcome() {
  await render(
    <SafeAreaProvider initialMetrics={{ frame, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <Welcome />
    </SafeAreaProvider>,
  );
}

beforeEach(async () => {
  mockReduceMotion = false;
  jest.mocked(router.push).mockClear();
  await i18n.changeLanguage('en');
});

describe('Welcome', () => {
  it('opens the name screen with Get started', async () => {
    await renderWelcome();
    await fireEvent.press(screen.getByText('Get started'));
    expect(router.push).toHaveBeenCalledWith('/name');
  });

  it('opens the code screen with I have a room code', async () => {
    await renderWelcome();
    await fireEvent.press(screen.getByText('I have a room code'));
    expect(router.push).toHaveBeenCalledWith('/join');
  });

  it('hides the hero from screen readers', async () => {
    await renderWelcome();
    const hero = screen.getByTestId('welcome-hero', { includeHiddenElements: true });
    expect(hero.props.accessibilityElementsHidden).toBe(true);
    expect(hero.props.importantForAccessibility).toBe('no-hide-descendants');
  });

  it('makes the title a header and the promises one element each', async () => {
    await renderWelcome();
    expect(screen.getByRole('header', { name: "Pick tonight's movie together" })).toBeTruthy();
    for (const text of [
      'Up to 10 friends in one room, no account needed',
      'Only films on the services you have',
      "No films you've seen, unless you want a rewatch",
    ]) {
      expect(screen.getByText(text).parent?.props.accessible).toBe(true);
    }
  });

  it('is in French on a French phone', async () => {
    await act(async () => {
      await i18n.changeLanguage('fr');
    });
    await renderWelcome();
    expect(screen.getByText("C'est parti")).toBeTruthy();
    expect(screen.getByText("J'ai un code de salle")).toBeTruthy();
  });

  it('pops the posters in, and not under Reduce Motion', async () => {
    await renderWelcome();
    const hero = screen.getByTestId('welcome-hero', { includeHiddenElements: true });
    const animated = (tree: typeof hero): number =>
      (tree.props.entering ? 1 : 0) +
      tree.children.reduce(
        (sum, child) => sum + (typeof child === 'string' ? 0 : animated(child)),
        0,
      );
    expect(animated(hero)).toBe(3);

    mockReduceMotion = true;
    await screen.unmount();
    await renderWelcome();
    const still = screen.getByTestId('welcome-hero', { includeHiddenElements: true });
    expect(animated(still)).toBe(0);
  });
});
