import { parseConfig } from './config';

const valid = {
  EXPO_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abc',
};

describe('configuration', () => {
  it('reads the two Supabase values', () => {
    expect(parseConfig(valid)).toEqual({
      supabaseUrl: 'http://127.0.0.1:54321',
      supabasePublishableKey: 'sb_publishable_abc',
    });
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
