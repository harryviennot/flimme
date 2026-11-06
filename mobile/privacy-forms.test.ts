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

const DANGEROUS_ANDROID = [
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_BACKGROUND_LOCATION',
  'android.permission.READ_CONTACTS',
  'android.permission.CAMERA',
  'android.permission.RECORD_AUDIO',
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.READ_MEDIA_VIDEO',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.READ_CALENDAR',
  'android.permission.POST_NOTIFICATIONS',
  'com.google.android.gms.permission.AD_ID',
];

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

  it('asks for no Android permission behind an undeclared data type', () => {
    const config = load('production');
    const asked = config.android?.permissions ?? [];
    expect(asked.filter((name) => DANGEROUS_ANDROID.includes(name))).toEqual([]);
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
