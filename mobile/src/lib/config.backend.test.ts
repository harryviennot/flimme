import { resolveConfig, stagingStatus } from './config';

const local = {
  EXPO_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abc',
};
const staging = {
  EXPO_PUBLIC_STAGING_SUPABASE_URL: 'https://abcd.supabase.co',
  EXPO_PUBLIC_STAGING_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_staging',
};
const both = { ...local, ...staging };

describe('the backend choice', () => {
  it('ignores the override outside development builds', () => {
    expect(resolveConfig(both, { dev: false, backend: 'staging' }).supabaseUrl).toBe(
      'http://127.0.0.1:54321',
    );
  });

  it('uses the local values when local is chosen', () => {
    expect(resolveConfig(both, { dev: true, backend: 'local' }).supabaseUrl).toBe(
      'http://127.0.0.1:54321',
    );
  });

  it('resolves the staging URL and key when staging is chosen', () => {
    expect(resolveConfig(both, { dev: true, backend: 'staging' })).toEqual({
      supabaseUrl: 'https://abcd.supabase.co',
      supabasePublishableKey: 'sb_publishable_staging',
    });
  });

  it('falls back to local when staging is chosen but its values are missing', () => {
    expect(resolveConfig(local, { dev: true, backend: 'staging' }).supabaseUrl).toBe(
      'http://127.0.0.1:54321',
    );
  });

  it('says why staging is unavailable, naming both variables', () => {
    const status = stagingStatus(local);
    expect(status.available).toBe(false);
    if (!status.available) {
      expect(status.reason).toContain('EXPO_PUBLIC_STAGING_SUPABASE_URL');
      expect(status.reason).toContain('EXPO_PUBLIC_STAGING_SUPABASE_PUBLISHABLE_KEY');
    }
  });

  it('refuses a staging URL that is not a URL', () => {
    expect(stagingStatus({ ...both, EXPO_PUBLIC_STAGING_SUPABASE_URL: 'nope' }).available).toBe(
      false,
    );
  });

  it('is available when both staging values are set', () => {
    expect(stagingStatus(both).available).toBe(true);
  });
});
