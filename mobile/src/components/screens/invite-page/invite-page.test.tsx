import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { setStringAsync } from 'expo-clipboard';
import Constants from 'expo-constants';
import { Linking } from 'react-native';

import i18n from '@/i18n';
import { resources } from '@/i18n/resources';

import { InvitePage } from './invite-page';

jest.mock('@/api', () => ({ rpc: jest.fn(), appConfig: jest.fn() }));
jest.mock('@/features/session', () => ({ startSession: jest.fn() }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { appStoreId: '' } } },
}));

const REF = '0b6b1f0e-1b1c-4a6e-9a43-2f3c1d9e8a77';
const LINK = `/join/482913?r=${REF}`;
const ORIGIN = 'https://example.test';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8)';

function setStoreId(id: string) {
  (Constants.expoConfig?.extra as { appStoreId: string }).appStoreId = id;
}

async function renderPage(link = LINK, userAgent = IPHONE) {
  await render(<InvitePage link={link} origin={ORIGIN} userAgent={userAgent} />);
}

beforeEach(async () => {
  setStoreId('');
  jest.mocked(setStringAsync).mockClear();
  jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  await i18n.changeLanguage('en');
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('InvitePage', () => {
  it('shows the title, the code and the three steps', async () => {
    await renderPage();
    expect(screen.getByRole('heading')).toHaveTextContent("You're invited to pick tonight's movie");
    expect(screen.getByText('482 913')).toBeOnTheScreen();
    expect(screen.getByLabelText('4 8 2 9 1 3')).toBeOnTheScreen();
    expect(screen.getByText('Get Flimme.')).toBeOnTheScreen();
    expect(screen.getByText('Open it and tap "I have a room code".')).toBeOnTheScreen();
    expect(screen.getByText('Type 482 913. Or tap your invite link again.')).toBeOnTheScreen();
    expect(screen.getByText('Streaming availability by JustWatch.')).toBeOnTheScreen();
  });

  it.each([
    ['a 5-digit code', `/join/48291?r=${REF}`],
    ['a reference that is not a uuid', '/join/482913?r=nope'],
    ['no code at all', '/'],
  ])('shows the broken state for %s', async (_name, link) => {
    await renderPage(link);
    expect(screen.getByRole('heading')).toHaveTextContent(
      'This invite link looks broken. Ask the host for the code.',
    );
    expect(screen.queryByText('Copy the link')).toBeNull();
    expect(screen.queryByText('482 913')).toBeNull();
    expect(screen.queryByText('Get Flimme.')).toBeNull();
  });

  it('works without a reference', async () => {
    await renderPage('/join/482913');
    expect(screen.getByText('482 913')).toBeOnTheScreen();
  });

  it('calls no API and starts no session', async () => {
    const { startSession } = jest.requireMock('@/features/session');
    await renderPage();
    await fireEvent.press(screen.getByText('Copy the link'));
    const mocked = jest.requireMock('@/api');
    for (const fn of Object.values<jest.Mock>(mocked)) expect(fn).not.toHaveBeenCalled();
    expect(startSession).not.toHaveBeenCalled();
  });

  it('copies the full link, then reads Copied for two seconds', async () => {
    jest.useFakeTimers();
    try {
      await renderPage();
      await fireEvent.press(screen.getByText('Copy the link'));
      expect(setStringAsync).toHaveBeenCalledWith(`${ORIGIN}/join/482913?r=${REF}`);
      expect(await screen.findByText('Copied')).toBeOnTheScreen();
      await act(async () => {
        jest.advanceTimersByTime(2000);
      });
      expect(screen.getByText('Copy the link')).toBeOnTheScreen();
    } finally {
      jest.useRealTimers();
    }
  });

  it('opens the app with the code and the reference', async () => {
    await renderPage();
    await fireEvent.press(screen.getByText('Have Flimme? Open it'));
    expect(Linking.openURL).toHaveBeenCalledWith(`flimme://join/482913?r=${REF}`);
  });

  it('shows no store badges while the App Store id is empty', async () => {
    await renderPage();
    expect(screen.queryByLabelText('Download on the App Store')).toBeNull();
    expect(screen.queryByLabelText('Get it on Google Play')).toBeNull();
  });

  it('shows both badges once the id is set, the device store first', async () => {
    setStoreId('123456789');
    await renderPage(LINK, ANDROID);
    const links = screen.getAllByRole('link').map((l) => l.props.accessibilityLabel);
    expect(links).toEqual(['Get it on Google Play', 'Download on the App Store']);
    await fireEvent.press(screen.getByLabelText('Download on the App Store'));
    expect(Linking.openURL).toHaveBeenCalledWith('https://apps.apple.com/app/id123456789');
  });

  it('puts the App Store first on an iPhone', async () => {
    setStoreId('123456789');
    await renderPage(LINK, IPHONE);
    const links = screen.getAllByRole('link').map((l) => l.props.accessibilityLabel);
    expect(links[0]).toBe('Download on the App Store');
  });

  it('speaks French when the language is French', async () => {
    await i18n.changeLanguage('fr');
    await renderPage();
    expect(screen.getByText('Copier le lien')).toBeOnTheScreen();
    expect(screen.getByRole('heading')).toHaveTextContent("On t'invite à choisir le film du soir");
  });
});

describe('the steps quote the Welcome button', () => {
  it.each(['fr', 'en'] as const)('in %s', (lang) => {
    const haveCode = resources[lang].onboarding.welcome.haveCode;
    expect(resources[lang].web.invite.steps.open).toContain(haveCode);
  });
});
