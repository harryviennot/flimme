import fs from 'node:fs';
import path from 'node:path';

import type { ConfigContext, ExpoConfig } from 'expo/config';

import appConfig from './app.config';
import pkg from './package.json';

// The store privacy forms (docs/store/privacy-forms.md) rest on these facts. If one of these tests
// fails, the app now collects something the forms don't declare: update the forms and the privacy
// policy before the change ships, then update the test.

const mockPostHog = jest.fn();
jest.mock('posthog-react-native', () => ({
  PostHog: jest.fn().mockImplementation((key: string, options: unknown) => {
    mockPostHog(key, options);
    return {
      identify: jest.fn(),
      reset: jest.fn(),
      optOut: jest.fn(),
      optIn: jest.fn(),
      capture: jest.fn(),
      screen: jest.fn(),
      shutdown: jest.fn(async () => undefined),
    };
  }),
}));

jest.mock('./src/lib/storage', () => {
  const kv = new Map<string, string>();
  return {
    storage: {
      getItemSync: (key: string) => kv.get(key) ?? null,
      setItemSync: (key: string, value: string) => void kv.set(key, value),
      removeItemSync: (key: string) => void kv.delete(key),
    },
  };
});

// Packages that would add a data type the forms say the app never collects: location, contacts,
// photos and videos, the camera, the calendar, health, notifications (push tokens), the
// advertising id or app tracking.
const UNDECLARED = [
  'expo-location',
  'expo-contacts',
  'expo-camera',
  'expo-image-picker',
  'expo-media-library',
  'expo-calendar',
  'expo-notifications',
  'expo-tracking-transparency',
  'expo-sensors',
  'expo-av',
  'expo-barcode-scanner',
  'react-native-vision-camera',
  'react-native-health',
  '@react-native-community/geolocation',
  'react-native-geolocation-service',
  'react-native-maps',
  '@react-native-firebase/analytics',
  '@react-native-firebase/messaging',
  'react-native-google-mobile-ads',
];

// Every Android permission the build may hold. Android merges each native module's own manifest
// into the app's at build time, so the app config alone doesn't show them. The storage pair only
// exists up to Android 12L (SDK 32), for expo-file-system's and expo-image's caches: the app never
// reads the player's photos or files.
const ALLOWED_ANDROID: Record<string, number | 'any'> = {
  'android.permission.INTERNET': 'any',
  'android.permission.ACCESS_NETWORK_STATE': 'any',
  'android.permission.ACCESS_WIFI_STATE': 'any',
  'android.permission.MODIFY_AUDIO_SETTINGS': 'any',
  'android.permission.VIBRATE': 'any',
  'android.permission.READ_EXTERNAL_STORAGE': 32,
  'android.permission.WRITE_EXTERNAL_STORAGE': 32,
};

/** The folder a package resolves to from `from`, following pnpm's links; null if absent. */
function packageDir(name: string, from: string): string | null {
  for (let dir = from; ; dir = path.dirname(dir)) {
    const file = path.join(dir, 'node_modules', name, 'package.json');
    if (fs.existsSync(file)) return path.dirname(fs.realpathSync(file));
    if (path.dirname(dir) === dir) return null;
  }
}

/** The app's dependencies and theirs, two levels down: where autolinked native modules come from. */
function installedPackages(): Map<string, string> {
  const found = new Map<string, string>();
  const visit = (name: string, from: string, depth: number) => {
    if (found.has(name)) return;
    const dir = packageDir(name, from);
    if (!dir) return;
    found.set(name, dir);
    if (depth >= 2) return;
    const own = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    for (const dep of Object.keys(own.dependencies ?? {})) visit(dep, dir, depth + 1);
  };
  for (const name of Object.keys(pkg.dependencies)) visit(name, __dirname, 0);
  return found;
}

type Permission = { from: string; name: string; maxSdk: number | null };

/** The permissions in the Android manifest of every installed package that has one. */
function androidPermissions(): Permission[] {
  const all: Permission[] = [];
  for (const [from, dir] of installedPackages()) {
    const manifest = path.join(dir, 'android', 'src', 'main', 'AndroidManifest.xml');
    if (!fs.existsSync(manifest)) continue;
    const xml = fs.readFileSync(manifest, 'utf8');
    for (const [tag] of xml.matchAll(/<uses-permission[^>]*>/g)) {
      const name = /android:name="([^"]+)"/.exec(tag)?.[1];
      const maxSdk = /android:maxSdkVersion="(\d+)"/.exec(tag)?.[1];
      if (name) all.push({ from, name, maxSdk: maxSdk ? Number(maxSdk) : null });
    }
  }
  return all;
}

function load(variant: string): ExpoConfig {
  const original = process.env.APP_VARIANT;
  process.env.APP_VARIANT = variant;
  try {
    return appConfig({ config: {}, projectRoot: '.' } as ConfigContext);
  } finally {
    if (original === undefined) delete process.env.APP_VARIANT;
    else process.env.APP_VARIANT = original;
  }
}

describe('what the store privacy forms declare', () => {
  it('has no package that reads location, contacts, photos, the camera or the advertising id', () => {
    const installed = Object.keys({ ...pkg.dependencies });
    expect(installed.filter((name) => UNDECLARED.includes(name))).toEqual([]);
  });

  it('asks for no Android permission beyond the network, sound, vibration and old caches', () => {
    const config = load('production');
    const blocked = new Set(config.android?.blockedPermissions ?? []);
    const fromConfig = (config.android?.permissions ?? []).map((name): Permission => ({
      from: 'app.config',
      name,
      maxSdk: null,
    }));
    const asked = [...fromConfig, ...androidPermissions()].filter(
      (permission) => !blocked.has(permission.name),
    );
    const extra = asked.filter(({ name, maxSdk }) => {
      const allowed = ALLOWED_ANDROID[name];
      if (allowed === undefined) return true;
      return allowed !== 'any' && (maxSdk === null || maxSdk > allowed);
    });
    expect(extra).toEqual([]);
    // The scan reaches the native modules: Sentry's own manifest asks for the network.
    expect(asked).toContainEqual({
      from: '@sentry/react-native',
      name: 'android.permission.INTERNET',
      maxSdk: null,
    });
  });

  it('tracks nothing on iOS (no "Data Used to Track You")', () => {
    const config = load('production');
    expect(config.ios?.privacyManifests?.NSPrivacyTracking).toBe(false);
    expect(config.ios?.privacyManifests?.NSPrivacyTrackingDomains).toEqual([]);
  });
});

describe('the PostHog client behind the usage stats', () => {
  const originalKey = process.env.EXPO_PUBLIC_POSTHOG_KEY;

  beforeEach(() => {
    mockPostHog.mockClear();
    process.env.EXPO_PUBLIC_POSTHOG_KEY = 'phc_test';
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.EXPO_PUBLIC_POSTHOG_KEY;
    else process.env.EXPO_PUBLIC_POSTHOG_KEY = originalKey;
  });

  function startIn(region: string): Record<string, unknown> {
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { analytics } = require('./src/lib/analytics') as typeof import('./src/lib/analytics');
      analytics.configure({
        choice: 'on',
        region: { deviceRegion: region, profileCountry: region },
        profileId: '00000000-0000-4000-8000-000000000001',
      });
    });
    expect(mockPostHog).toHaveBeenCalledTimes(1);
    return mockPostHog.mock.calls[0][1] as Record<string, unknown>;
  }

  it('sends only what the screens ask for: no lifecycle events, replay, surveys or crashes', () => {
    const options = startIn('FR');
    expect(options).toMatchObject({
      host: 'https://eu.i.posthog.com',
      captureAppLifecycleEvents: false,
      enableSessionReplay: false,
      disableSurveys: true,
      errorTracking: { autocapture: false },
    });
  });

  it('never turns an IP address into a location', () => {
    expect(startIn('FR')).toMatchObject({ disableGeoip: true });
  });

  it('keeps no person in Europe, and links stats to the profile elsewhere', () => {
    expect(startIn('FR')).toMatchObject({ personProfiles: 'never' });
    mockPostHog.mockClear();
    expect(startIn('US')).toMatchObject({ personProfiles: 'identified_only' });
  });
});
