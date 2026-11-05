import { analyticsKey, parseConfig } from './config';

const valid = {
  EXPO_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abc',
  EXPO_PUBLIC_SERVER_URL: 'http://127.0.0.1:8000',
};

describe('configuration', () => {
  it('reads the two Supabase values and the server URL', () => {
    expect(parseConfig(valid)).toEqual({
      supabaseUrl: 'http://127.0.0.1:54321',
      supabasePublishableKey: 'sb_publishable_abc',
      serverUrl: 'http://127.0.0.1:8000',
    });
  });

  it('names the variable when the server URL is missing or not a URL', () => {
    const name = 'EXPO_PUBLIC_SERVER_URL';
    expect(() => parseConfig({ ...valid, [name]: undefined })).toThrow(name);
    expect(() => parseConfig({ ...valid, [name]: '' })).toThrow(name);
    expect(() => parseConfig({ ...valid, [name]: 'nope' })).toThrow(name);
  });

  it('names the variable when the URL is missing', () => {
    expect(() => parseConfig({ ...valid, EXPO_PUBLIC_SUPABASE_URL: undefined })).toThrow(
      'EXPO_PUBLIC_SUPABASE_URL',
    );
  });

  it('names the variable when the URL is not a URL', () => {
    expect(() => parseConfig({ ...valid, EXPO_PUBLIC_SUPABASE_URL: 'not a url' })).toThrow(
      'EXPO_PUBLIC_SUPABASE_URL',
    );
    expect(() => parseConfig({ ...valid, EXPO_PUBLIC_SUPABASE_URL: 'ftp://host' })).toThrow(
      'EXPO_PUBLIC_SUPABASE_URL',
    );
  });

  it('names the variable when the key is missing or blank', () => {
    const key = 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY';
    expect(() => parseConfig({ ...valid, [key]: undefined })).toThrow(key);
    expect(() => parseConfig({ ...valid, [key]: '  ' })).toThrow(key);
  });
});

describe('the analytics key', () => {
  it('is optional: empty or missing turns analytics off and never stops the app', () => {
    expect(analyticsKey({})).toBeNull();
    expect(analyticsKey({ EXPO_PUBLIC_POSTHOG_KEY: '' })).toBeNull();
    expect(analyticsKey({ EXPO_PUBLIC_POSTHOG_KEY: '  ' })).toBeNull();
    expect(() => parseConfig(valid)).not.toThrow();
  });

  it('reads the key when it is set', () => {
    expect(analyticsKey({ EXPO_PUBLIC_POSTHOG_KEY: ' phc_x ' })).toBe('phc_x');
  });
});
