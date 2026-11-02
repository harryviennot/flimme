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

let cached: AppConfig | undefined;

export function getConfig(): AppConfig {
  // Expo inlines `process.env.EXPO_PUBLIC_*` only when written out in full.
  cached ??= parseConfig({
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  return cached;
}
