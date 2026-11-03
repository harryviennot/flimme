import { ApiError } from '@flimme/contract';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { router } from 'expo-router';
// eslint-disable-next-line no-restricted-imports -- the test spies on TextInput's focus
import { AccessibilityInfo, TextInput } from 'react-native';
import type { ReactNode } from 'react';

import { api } from '@/api';
import { Text } from '@/components/ui/text';
import { showToast } from '@/components/ui/toast';
import i18n from '@/i18n';
import { MY_PROFILE_KEY } from '@/features/profile';
import { haptics } from '@/lib/haptics';

let mockOnline = true;
let mockReduceMotion = false;
const mockSetItemSync = jest.fn();

jest.mock('@/api', () => ({
  api: { myProfile: jest.fn(), updateProfile: jest.fn() },
}));
jest.mock('@/features/network', () => ({ useOnline: () => mockOnline }));
jest.mock('@/lib/storage', () => ({
  storage: {
    getItemSync: () => null,
    setItemSync: (...args: unknown[]) => mockSetItemSync(...args),
  },
}));
jest.mock('@/components/ui/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/lib/haptics', () => ({
  haptics: { error: jest.fn(), press: jest.fn() },
}));
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  return new Proxy(actual, {
    get: (target, key) => (key === 'useReducedMotion' ? () => mockReduceMotion : target[key]),
  });
});

const updateProfile = jest.mocked(api.updateProfile);
const myProfile = jest.mocked(api.myProfile);

const base = {
  id: 'u1',
  country: 'FR',
  language: 'en',
  created_at: '2026-11-03T00:00:00Z',
};

let client: QueryClient;
function Providers({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function Stub({ label }: { label: string }) {
  return <Text>{label}</Text>;
}

/* eslint-disable @typescript-eslint/no-require-imports */
const routes = {
  index: () => <Stub label="index" />,
  welcome: () => <Stub label="welcome" />,
  home: () => <Stub label="home" />,
  join: () => <Stub label="join" />,
  name: require('@/app/name').default,
};
/* eslint-enable @typescript-eslint/no-require-imports */

async function open(url: string, from?: string) {
  await renderRouter(routes, { initialUrl: from ?? url, wrapper: Providers });
  if (from) await act(async () => router.push(url as never));
}

const field = () => screen.getByLabelText('Your name');
const cont = () => screen.getByRole('button', { name: 'Continue' });
async function type(text: string) {
  await fireEvent.changeText(field(), text);
}
async function submit() {
  await fireEvent.press(cont());
}

beforeEach(async () => {
  jest.clearAllMocks();
  mockOnline = true;
  mockReduceMotion = false;
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  myProfile.mockResolvedValue({ ...base, display_name: '', avatar_key: 'default' });
  updateProfile.mockResolvedValue({ status: 'ok', display_name: 'Léa', avatar_key: 'blue' });
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
  await i18n.changeLanguage('en');
});

describe('Continue', () => {
  it.each([
    ['', false],
    ['   ', false],
    ['a'.repeat(25), false],
    ['a', true],
    ['a'.repeat(24), true],
  ])('with %j is enabled: %s', async (text, enabled) => {
    await open('/name');
    await type(text);
    if (enabled) expect(cont()).toBeEnabled();
    else expect(cont()).toBeDisabled();
  });

  it('shows loading while saving and ignores a second press', async () => {
    let resolve: (v: unknown) => void = () => undefined;
    updateProfile.mockReturnValue(new Promise((r) => (resolve = r)) as never);
    await open('/name');
    await type('Léa');
    await submit();
    await submit();
    expect(updateProfile).toHaveBeenCalledTimes(1);
    expect(cont().props.accessibilityState).toMatchObject({ busy: true });
    await act(async () => resolve({ status: 'ok', display_name: 'Léa', avatar_key: 'blue' }));
  });

  it('sends the trimmed name and the chosen color', async () => {
    await open('/name');
    await type('  Léa ');
    await fireEvent.press(screen.getByRole('radio', { name: /^Teal/ }));
    await submit();
    expect(updateProfile).toHaveBeenCalledWith({ display_name: 'Léa', avatar_key: 'teal' });
  });
});

describe('after ok', () => {
  it('from Welcome leaves Home alone in the stack', async () => {
    await open('/name', '/welcome');
    await type('Léa');
    await submit();
    await waitFor(() => expect(screen).toHavePathname('/home'));
    expect(router.canGoBack()).toBe(false);
  });

  it.each(['/name?code=482913', '/name?edit=1'])('%s goes back', async (url) => {
    await open(url, '/join');
    await type('Léa');
    await submit();
    await waitFor(() => expect(screen).toHavePathname('/join'));
  });

  it('keeps the normalised name and avatar in the profile query and on the device', async () => {
    client.setQueryData(MY_PROFILE_KEY, { ...base, display_name: '', avatar_key: 'default' });
    updateProfile.mockResolvedValue({ status: 'ok', display_name: 'Léa', avatar_key: 'gold' });
    await open('/name', '/welcome');
    await type(' léa ');
    await submit();
    await waitFor(() =>
      expect(client.getQueryData(MY_PROFILE_KEY)).toMatchObject({
        display_name: 'Léa',
        avatar_key: 'gold',
      }),
    );
    expect(mockSetItemSync).toHaveBeenCalled();
  });
});

describe('refusals', () => {
  it.each([
    ['invalid_name', 'Use at least one letter or number.'],
    ['name_not_allowed', "That name isn't allowed. Pick another one."],
  ] as const)(
    '%s shows its error, keeps the text and clears at the next edit',
    async (status, message) => {
      updateProfile.mockResolvedValue({ status });
      await open('/name');
      await type('Bob');
      await submit();
      expect(await screen.findByText(message)).toBeTruthy();
      expect(haptics.error).toHaveBeenCalled();
      expect(field().props.value).toBe('Bob');
      await fireEvent.press(screen.getByRole('radio', { name: /^Teal/ }));
      expect(screen.getByText(message)).toBeTruthy();
      await type('Bobo');
      expect(screen.queryByText(message)).toBeNull();
    },
  );

  it('shows the generic toast for unknown_avatar and for an unexpected failure', async () => {
    updateProfile.mockResolvedValueOnce({ status: 'unknown_avatar' });
    await open('/name');
    await type('Léa');
    await submit();
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith({ tone: 'warn', title: 'The projector jammed' }),
    );
    jest.mocked(showToast).mockClear();
    updateProfile.mockRejectedValueOnce(new ApiError('unexpected', 'update_profile', 'x'));
    await submit();
    await waitFor(() => expect(showToast).toHaveBeenCalledTimes(1));
  });

  it('shows the offline toast and sends nothing while offline', async () => {
    mockOnline = false;
    await open('/name');
    await type('Léa');
    await submit();
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith({
        tone: 'warn',
        title: "You're offline. Connect to continue.",
      }),
    );
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it('shows the offline toast when the call fails with a network error', async () => {
    updateProfile.mockRejectedValue(new ApiError('network', 'update_profile', 'x'));
    await open('/name');
    await type('Léa');
    await submit();
    await waitFor(() => expect(showToast).toHaveBeenCalledTimes(1));
    expect(jest.mocked(showToast).mock.calls[0]?.[0].title).toMatch(/offline/);
  });
});

describe('the form', () => {
  it('first open selects one of the six colors', async () => {
    await open('/name');
    expect(screen.getAllByRole('radio', { selected: true })).toHaveLength(1);
  });

  it('editing fills in the current name and color', async () => {
    const maya = { ...base, display_name: 'Maya', avatar_key: 'red' };
    myProfile.mockResolvedValue(maya);
    client.setQueryData(MY_PROFILE_KEY, maya);
    await open('/name?edit=1');
    expect(field().props.value).toBe('Maya');
    expect(screen.getByRole('radio', { name: 'Red, selected' })).toBeTruthy();
  });

  it('a pressed swatch is selected and every swatch shows the typed initial', async () => {
    await open('/name');
    await type('léa');
    await fireEvent.press(screen.getByRole('radio', { name: /^Violet/ }));
    expect(screen.getByRole('radio', { name: 'Violet, selected' })).toBeTruthy();
    expect(screen.getAllByText('l')).toHaveLength(6);
  });

  it('groups the swatches as a labelled radio group with a name each', async () => {
    await open('/name');
    expect(screen.getByLabelText('Your color').props.accessibilityRole).toBe('radiogroup');
    for (const color of ['Blue', 'Green', 'Gold', 'Red', 'Violet', 'Teal']) {
      expect(screen.getAllByRole('radio', { name: new RegExp(`^${color}`) })).toHaveLength(1);
    }
  });

  it('focuses the field on open', async () => {
    const focus = jest.spyOn(TextInput.prototype, 'focus');
    await open('/name');
    await waitFor(() => expect(focus).toHaveBeenCalled());
  });

  it('does not focus the field on open with a screen reader on', async () => {
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(true);
    const focus = jest.spyOn(TextInput.prototype, 'focus');
    await open('/name');
    await act(async () => undefined);
    expect(focus).not.toHaveBeenCalled();
  });

  it('focuses the input when the field padding is pressed', async () => {
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(true);
    const focus = jest.spyOn(TextInput.prototype, 'focus');
    await open('/name');
    await fireEvent.press(screen.getByTestId('input-field'));
    expect(focus).toHaveBeenCalled();
  });
});
