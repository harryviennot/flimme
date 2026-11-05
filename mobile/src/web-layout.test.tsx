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

  it.each([
    ['/fr/confidentialite', 'fr'],
    ['/en/privacy', 'en'],
    ['/fr/conditions', 'fr'],
    ['/en/terms', 'en'],
    ['/fr/assistance', 'fr'],
    ['/en/support', 'en'],
    ['/fr/suppression', 'fr'],
    ['/en/delete-account', 'en'],
  ])(
    'shows the legal route at %s, in the path language, with no session',
    async (pathname, lang) => {
      mockPathname = pathname;
      await i18n.changeLanguage(lang === 'fr' ? 'en' : 'fr'); // the path wins over the browser
      await render(<WebRootLayout />);
      expect(screen.getByText('stack')).toBeOnTheScreen();
      const doc = (
        globalThis as unknown as { document: { documentElement: { lang: string }; title: string } }
      ).document;
      expect(doc.documentElement.lang).toBe(lang);
      expect(doc.title.length).toBeGreaterThan(5);
      expect(startSession).not.toHaveBeenCalled();
      expect(initSentry).not.toHaveBeenCalled();
    },
  );

  it.each(['/fr/privacy', '/en/confidentialite', '/de/privacy', '/fr', '/en/privacy/x'])(
    'shows the broken-link state at %s',
    async (pathname) => {
      mockPathname = pathname;
      await render(<WebRootLayout />);
      expect(screen.queryByText('stack')).toBeNull();
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

describe('the legal route files', () => {
  // The legal pages are for the browser. Expo Router wants a sibling without a platform suffix for
  // a web route, so the phone gets `[page].tsx`, which must show "not found" and import nothing of
  // the legal pages.
  const dir = path.join(__dirname, 'app', '[lang]');

  it('has only the web route and the phone fallback', () => {
    expect(fs.readdirSync(dir).sort()).toEqual(['[page].tsx', '[page].web.tsx']);
  });

  it('keeps the legal pages out of the phone fallback', () => {
    const source = fs.readFileSync(path.join(dir, '[page].tsx'), 'utf8');
    expect(source).not.toMatch(/from '[^']*legal/i);
    expect(source).toMatch(/NotFoundScreen/);
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

  // A fingerprint is 32 uppercase hex pairs with colons, as `eas credentials` prints it.
  it('every assetlinks.json fingerprint is a SHA-256', () => {
    const fingerprint = /^[0-9A-F]{2}(?::[0-9A-F]{2}){31}$/;
    const links: { target: { sha256_cert_fingerprints: string[] } }[] = read('assetlinks.json');
    for (const { target } of links) {
      for (const value of target.sha256_cert_fingerprints) expect(value).toMatch(fingerprint);
    }
  });

  it('assetlinks.json has no placeholder left', () => {
    expect(fs.readFileSync(path.join(dir, 'assetlinks.json'), 'utf8')).not.toMatch(/REPLACE_WITH/);
  });
});
