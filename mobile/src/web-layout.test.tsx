import { render, screen } from '@testing-library/react-native';
import fs from 'node:fs';
import path from 'node:path';

import WebRootLayout from '@/app/_layout.web';
import { initSentry } from '@/lib/sentry';
import { startSession } from '@/features/session';
import { registerDevMenu } from '@/features/dev/dev-menu';
import { watchNetwork } from '@/features/network';
import i18n from '@/i18n';
import fonts from '@/theme/fonts.json';
import { webFonts } from '@/theme/web-fonts';

let mockPathname = '/join/482913';

jest.mock('@/global.css', () => ({}), { virtual: true });
jest.mock('expo-router', () => ({
  Stack: () => {
    const { Text } = jest.requireActual('react-native');
    return <Text>stack</Text>;
  },
  usePathname: () => mockPathname,
  useGlobalSearchParams: () => ({}),
}));
jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('expo-font', () => ({ useFonts: () => [true, null] }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('@/features/session', () => ({ startSession: jest.fn() }));
jest.mock('@/features/network', () => ({ watchNetwork: jest.fn() }));
jest.mock('@/features/dev/dev-menu', () => ({ registerDevMenu: jest.fn() }));
jest.mock('@/lib/sentry', () => ({ initSentry: jest.fn(), wrapRoot: jest.fn() }));

beforeEach(async () => {
  await i18n.changeLanguage('en');
});

describe('the web root layout', () => {
  beforeEach(() => {
    // The layout sets the document's language and title; the test runtime has no DOM.
    const doc = {
      documentElement: { lang: '' },
      title: '',
      head: { appendChild: jest.fn() },
      querySelector: () => ({ setAttribute: jest.fn() }),
      createElement: jest.fn(),
    };
    (globalThis as unknown as { document: unknown }).document = doc;
  });

  it('shows the invite route for /join/<code> and starts no session, gate or Sentry', async () => {
    mockPathname = '/join/482913';
    await render(<WebRootLayout />);
    expect(screen.getByText('stack')).toBeOnTheScreen();
    expect(startSession).not.toHaveBeenCalled();
    expect(initSentry).not.toHaveBeenCalled();
    expect(watchNetwork).not.toHaveBeenCalled();
    expect(registerDevMenu).not.toHaveBeenCalled();
  });

  it.each(['/', '/home', '/join', '/room/abc/lobby'])(
    'shows the broken-link state at %s',
    async (pathname) => {
      mockPathname = pathname;
      await render(<WebRootLayout />);
      expect(screen.queryByText('stack')).toBeNull();
      expect(screen.getByRole('heading')).toHaveTextContent(/looks broken/);
      expect(startSession).not.toHaveBeenCalled();
    },
  );

  it('sets the page language and title', async () => {
    mockPathname = '/join/482913';
    await i18n.changeLanguage('fr');
    await render(<WebRootLayout />);
    const doc = (
      globalThis as unknown as { document: { documentElement: { lang: string }; title: string } }
    ).document;
    expect(doc.documentElement.lang).toBe('fr');
    expect(doc.title).toBe('Rejoins la soirée film sur Flimme');
  });
});

describe('the web fonts', () => {
  it('are the embedded fonts, by PostScript name', () => {
    expect(Object.keys(webFonts).sort()).toEqual(fonts.fonts.map((f) => f.postScriptName).sort());
  });
});

describe('the verification files', () => {
  const dir = path.join(__dirname, '..', 'public', '.well-known');
  const read = (name: string) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));

  it('apple-app-site-association lists the production and preview apps and /join/* only', () => {
    const { applinks } = read('apple-app-site-association');
    expect(applinks.details).toHaveLength(1);
    const [detail] = applinks.details;
    // The Apple Team ID (M4.18): the apps are `<team id>.<bundle id>`.
    expect([...detail.appIDs].sort()).toEqual([
      'QQJF5895MC.com.harryviennot.flimme',
      'QQJF5895MC.com.harryviennot.flimme.preview',
    ]);
    expect(detail.components).toEqual([{ '/': '/join/*' }]);
  });

  it('apple-app-site-association has no placeholder left', () => {
    expect(fs.readFileSync(path.join(dir, 'apple-app-site-association'), 'utf8')).not.toMatch(
      /REPLACE_WITH/,
    );
  });

  it('assetlinks.json lists the production and preview packages', () => {
    const links = read('assetlinks.json');
    expect(
      links.map((l: { target: { package_name: string } }) => l.target.package_name).sort(),
    ).toEqual(['com.harryviennot.flimme', 'com.harryviennot.flimme.preview']);
    for (const l of links) {
      expect(l.relation).toEqual(['delegate_permission/common.handle_all_urls']);
      expect(l.target.namespace).toBe('android_app');
      expect(l.target.sha256_cert_fingerprints.length).toBeGreaterThan(0);
    }
  });

  // A fingerprint is 32 uppercase hex pairs with colons, as `eas credentials` prints it. Until
  // Harry sends them (M4.18, H2) each package keeps its own named placeholder; the deploy check
  // (tools/check-well-known.mjs without --allow-placeholders) refuses a placeholder on the domain.
  it('every assetlinks.json fingerprint is a SHA-256 or its package placeholder', () => {
    const fingerprint = /^[0-9A-F]{2}(?::[0-9A-F]{2}){31}$/;
    const placeholder: Record<string, string> = {
      'com.harryviennot.flimme': 'REPLACE_WITH_PRODUCTION_KEY_SHA256',
      'com.harryviennot.flimme.preview': 'REPLACE_WITH_PREVIEW_KEY_SHA256',
    };
    const links: { target: { package_name: string; sha256_cert_fingerprints: string[] } }[] =
      read('assetlinks.json');
    for (const { target } of links) {
      for (const value of target.sha256_cert_fingerprints) {
        if (value !== placeholder[target.package_name]) expect(value).toMatch(fingerprint);
      }
    }
  });
});
