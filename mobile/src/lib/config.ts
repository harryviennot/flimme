import { useDevStore } from '@/features/dev';

// The app's configuration, read once. Only public values live here (security.md#the-app).
// A missing or malformed value stops the app at start with a message naming the variable
// (groundwork.md#secrets). The server URL is not checked yet: the first task that calls
// the server adds it.

export type AppConfig = {
  supabaseUrl: string;
  supabasePublishableKey: string;
};

type Env = Record<string, string | undefined>;

function requireValue(env: Env, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is missing. Copy mobile/.env.example to .env.local.`);
  return value;
}

function requireUrl(env: Env, name: string): string {
  const value = requireValue(env, name);
  let protocol: string;
  try {
    protocol = new URL(value).protocol;
  } catch {
    throw new Error(`${name} is not a URL (expected http:// or https://).`);
  }
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new Error(`${name} is not a URL (expected http:// or https://).`);
  }
  return value;
}

export function parseConfig(env: Env): AppConfig {
  return {
    supabaseUrl: requireUrl(env, 'EXPO_PUBLIC_SUPABASE_URL'),
    supabasePublishableKey: requireValue(env, 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
  };
}

export type Backend = 'local' | 'staging';

const STAGING_URL = 'EXPO_PUBLIC_STAGING_SUPABASE_URL';
const STAGING_KEY = 'EXPO_PUBLIC_STAGING_SUPABASE_PUBLISHABLE_KEY';

export type StagingStatus =
  { available: true; config: AppConfig } | { available: false; reason: string };

/** Whether the staging backend can be used, and if not, which variables to set. */
export function stagingStatus(env: Env): StagingStatus {
  const missing = [STAGING_URL, STAGING_KEY].filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    return { available: false, reason: `Set ${missing.join(' and ')} in .env.local or EAS.` };
  }
  try {
    return {
      available: true,
      config: {
        supabaseUrl: requireUrl(env, STAGING_URL),
        supabasePublishableKey: requireValue(env, STAGING_KEY),
      },
    };
  } catch (error) {
    return { available: false, reason: (error as Error).message };
  }
}

/**
 * The values the app runs on. The staging choice only counts in a development build, and
 * only when its values are there: otherwise the local ones are used, so a wrong saved
 * choice can never leave the app unable to start.
 */
export function resolveConfig(env: Env, options: { dev: boolean; backend: Backend }): AppConfig {
  if (options.dev && options.backend === 'staging') {
    const staging = stagingStatus(env);
    if (staging.available) return staging.config;
  }
  return parseConfig(env);
}

function readEnv(): Env {
  // Expo inlines `process.env.EXPO_PUBLIC_*` only when written out in full.
  return {
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    [STAGING_URL]: process.env.EXPO_PUBLIC_STAGING_SUPABASE_URL,
    [STAGING_KEY]: process.env.EXPO_PUBLIC_STAGING_SUPABASE_PUBLISHABLE_KEY,
  };
}

export function getStagingStatus(): StagingStatus {
  return stagingStatus(readEnv());
}

let cached: AppConfig | undefined;

/** Read once per JavaScript run: switching backend reloads the app. */
export function getConfig(): AppConfig {
  cached ??= resolveConfig(readEnv(), {
    dev: __DEV__,
    backend: useDevStore.getState().backend,
  });
  return cached;
}
