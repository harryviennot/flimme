// Reanimated's test mode: animations finish at once and shared values are plain values.
require('react-native-reanimated').setUpTests();

// Public configuration for tests (lib/config.ts refuses to start without it).
process.env.EXPO_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??= 'sb_publishable_test';
