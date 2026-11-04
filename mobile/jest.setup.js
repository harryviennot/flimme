// Reanimated's test mode: animations finish at once and shared values are plain values.
require('react-native-reanimated').setUpTests();

// Public configuration for tests (lib/config.ts refuses to start without it).
process.env.EXPO_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??= 'sb_publishable_test';

/* global jest */
// Sentry is native and ESM: tests never reach it (lib/sentry.test.ts checks how it is called).
jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  nativeCrash: jest.fn(),
  wrap: (component) => component,
}));

// expo-audio is native: tests never play a sound (lib/sound.ts is a no-op until M6.24 anyway).
jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(),
  setAudioModeAsync: jest.fn(async () => undefined),
}));
