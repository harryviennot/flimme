import { describe, expect, it } from 'vitest';

import {
  assertAllowedUrl,
  parseAccounts,
  parseDuration,
  parseLoadArgs,
  UsageError,
} from './config';

const STAGING = 'https://mfpkphxjndvtafgeeoeh.supabase.co';

describe('parseDuration', () => {
  it('reads seconds, minutes and hours', () => {
    expect(parseDuration('90s')).toBe(90_000);
    expect(parseDuration('5m')).toBe(300_000);
    expect(parseDuration('1h')).toBe(3_600_000);
  });
  it('refuses anything else', () => {
    expect(() => parseDuration('5')).toThrow(UsageError);
    expect(() => parseDuration('soon')).toThrow(UsageError);
  });
});

describe('parseLoadArgs', () => {
  it('defaults to the load test scenario', () => {
    const config = parseLoadArgs(['--full', '--target', 'staging']);
    expect(config).toMatchObject({
      rooms4: 45,
      rooms10: 5,
      rampMs: 300_000,
      durationMs: 1_800_000,
      likeRate: 0.3,
      swipeMs: 3000,
      target: 'staging',
    });
  });
  it('refuses more than 20 bots without --full', () => {
    expect(() => parseLoadArgs(['--rooms4', '45', '--rooms10', '5'])).toThrow(/--full/);
    expect(() => parseLoadArgs(['--rooms4', '5', '--rooms10', '0'])).not.toThrow();
    expect(() => parseLoadArgs(['--rooms4', '5', '--rooms10', '1'])).toThrow(/--full/);
    expect(() => parseLoadArgs(['--rooms4', '2', '--rooms10', '1'])).not.toThrow();
  });
  it('takes the small values of a dry run', () => {
    const config = parseLoadArgs([
      '--rooms4',
      '3',
      '--rooms10',
      '0',
      '--ramp',
      '30s',
      '--duration',
      '5m',
    ]);
    expect(config).toMatchObject({ rooms4: 3, rooms10: 0, rampMs: 30_000, durationMs: 300_000 });
  });
  it('refuses unknown options, missing values and bad numbers', () => {
    expect(() => parseLoadArgs(['--wat', '1'])).toThrow(UsageError);
    expect(() => parseLoadArgs(['--rooms4'])).toThrow(UsageError);
    expect(() => parseLoadArgs(['--rooms4', '-1'])).toThrow(UsageError);
    expect(() => parseLoadArgs(['--like-rate', '2'])).toThrow(UsageError);
    expect(() => parseLoadArgs(['--target', 'production'])).toThrow(UsageError);
    expect(() => parseLoadArgs(['--rooms4', '0', '--rooms10', '0'])).toThrow(UsageError);
  });
});

describe('assertAllowedUrl', () => {
  it('accepts staging for the staging target and the local stack for local', () => {
    expect(() => assertAllowedUrl(STAGING, 'staging')).not.toThrow();
    expect(() => assertAllowedUrl('http://127.0.0.1:54321', 'local')).not.toThrow();
    expect(() => assertAllowedUrl('http://localhost:54321', 'local')).not.toThrow();
  });
  it('refuses a production URL or any other host, whatever the target says', () => {
    const production = 'https://abcdefghijklmnopqrst.supabase.co';
    expect(() => assertAllowedUrl(production, 'staging')).toThrow(/staging/);
    expect(() => assertAllowedUrl(production, 'local')).toThrow(UsageError);
    expect(() => assertAllowedUrl(STAGING, 'local')).toThrow(UsageError);
    expect(() => assertAllowedUrl('http://127.0.0.1:54321', 'staging')).toThrow(UsageError);
    expect(() =>
      assertAllowedUrl('https://mfpkphxjndvtafgeeoeh.supabase.co.evil.test', 'staging'),
    ).toThrow(UsageError);
    expect(() => assertAllowedUrl('not a url', 'staging')).toThrow(UsageError);
  });
  it('does not print the URL it refuses', () => {
    try {
      assertAllowedUrl('https://secret-project.supabase.co', 'staging');
    } catch (error) {
      expect((error as Error).message).not.toContain('secret-project');
    }
  });
});

describe('parseAccounts', () => {
  it('reads a JSON list of email and password', () => {
    const accounts = parseAccounts(
      '[{"email":"a@x.test","password":"p1"},{"email":"b@x.test","password":"p2"}]',
    );
    expect(accounts).toEqual([
      { email: 'a@x.test', password: 'p1' },
      { email: 'b@x.test', password: 'p2' },
    ]);
  });
  it('refuses a malformed list without echoing it', () => {
    try {
      parseAccounts('[{"email":"leak@x.test"}]');
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(UsageError);
      expect((error as Error).message).not.toContain('leak@x.test');
    }
    expect(() => parseAccounts('nope')).toThrow(UsageError);
  });
});
