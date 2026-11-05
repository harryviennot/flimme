import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import Home from '@/app/(tabs)/play';
import i18n from '@/i18n';

let mockOnline = true;
let mockProfile: { display_name: string; avatar_key: string } | null = null;

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/features/solo/leave', () => ({ useSettleSolo: () => undefined }));
jest.mock('@/features/network', () => ({ useOnline: () => mockOnline }));
jest.mock('@/features/profile', () => ({
  toAvatarColor: jest.requireActual('@/features/profile/device').toAvatarColor,
  useMyProfile: () => ({ data: mockProfile }),
}));
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => undefined),
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Rigid: 'rigid', Soft: 'soft' },
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));

const frame = { x: 0, y: 0, width: 375, height: 812 };

async function renderHome() {
  await render(
    <QueryClientProvider client={new QueryClient()}>
      <SafeAreaProvider
        initialMetrics={{ frame, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}
      >
        <Home />
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  mockOnline = true;
  mockProfile = { display_name: 'Léa', avatar_key: 'green' };
  jest.mocked(router.push).mockClear();
  await i18n.changeLanguage('en');
});

const OFFLINE = "You're offline. Connect to host or join.";

describe('Home', () => {
  it('opens host setup and the code screen', async () => {
    await renderHome();
    await fireEvent.press(screen.getByText('Open a room'));
    expect(router.push).toHaveBeenLastCalledWith('/host');
    await fireEvent.press(screen.getByText('Join'));
    expect(router.push).toHaveBeenLastCalledWith('/join');
  });

  it('shows the Play alone card under the join card and opens its setup', async () => {
    await renderHome();
    expect(screen.getByText('On your own tonight?')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Play alone'));
    expect(router.push).toHaveBeenLastCalledWith('/solo');
  });

  it('opens the name screen in edit mode and the settings', async () => {
    await renderHome();
    await fireEvent.press(screen.getByRole('button', { name: /^Good .*, Léa$/ }));
    expect(router.push).toHaveBeenLastCalledWith('/name?edit=1');
    await fireEvent.press(screen.getByLabelText('Settings'));
    expect(router.push).toHaveBeenLastCalledWith('/settings');
  });

  it('shows the cached name and the greeting', async () => {
    await renderHome();
    expect(screen.getByText('Léa')).toBeOnTheScreen();
    expect(screen.getByText(/^Good (morning|afternoon|evening)$/)).toBeOnTheScreen();
  });

  it('reads the greeting and the name to a screen reader, with the edit as a hint', async () => {
    await renderHome();
    const button = screen.getByRole('button', { name: /^Good (morning|afternoon|evening), Léa$/ });
    expect(button.props.accessibilityHint).toBe('Edit your name and color');
    await i18n.changeLanguage('fr');
    expect(
      screen.getByRole('button', { name: /^(Bonjour|Bon après-midi|Bonsoir), Léa$/ }).props
        .accessibilityHint,
    ).toBe('Modifier ton prénom et ta couleur');
  });

  it('draws a picked color, and an unknown avatar key as blue', async () => {
    await renderHome();
    expect(screen.getByLabelText('Léa').props.className).toContain('bg-avatar-green');
    await screen.unmount();
    mockProfile = { display_name: 'Léa', avatar_key: 'default' };
    await renderHome();
    expect(screen.getByLabelText('Léa').props.className).toContain('bg-avatar-blue');
  });

  it('keeps both cards while the profile is unknown', async () => {
    mockProfile = null;
    await renderHome();
    expect(screen.getByText('Open a room')).toBeOnTheScreen();
    expect(screen.getByText('Join')).toBeOnTheScreen();
    expect(screen.queryByText('Léa')).toBeNull();
  });

  it('shows the offline banner and still navigates', async () => {
    mockOnline = false;
    await renderHome();
    expect(screen.getByText(OFFLINE)).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Open a room'));
    expect(router.push).toHaveBeenLastCalledWith('/host');
    await fireEvent.press(screen.getByText('Join'));
    expect(router.push).toHaveBeenLastCalledWith('/join');
  });

  it('has no banner when online', async () => {
    await renderHome();
    expect(screen.queryByText(OFFLINE)).toBeNull();
  });

  it('marks the card titles as headers', async () => {
    await renderHome();
    expect(screen.getByRole('header', { name: 'Host a movie night' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Got a room code?' })).toBeOnTheScreen();
  });
});
