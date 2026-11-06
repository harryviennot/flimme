import { describe, expect, it } from 'vitest';

import { localBackend, parseArgs, parseStatusEnv, stagingBackend, UsageError } from './config';

describe('parseArgs', () => {
  it('defaults to three mixed bots on the local stack that swipe at their own pace', () => {
    expect(parseArgs(['--code', '482913', '--seed', '5'])).toEqual({
      action: 'play',
      as: 'guest',
      code: '482913',
      count: 3,
      target: 'local',
      swipeMs: null,
      likeRate: null,
      seed: 5,
      personality: 'mixed',
    });
  });

  it('draws a seed when none is given, and takes off, picky and agreeable', () => {
    const a = parseArgs(['--code', '482913']);
    expect(Number.isInteger(a.seed)).toBe(true);
    expect(parseArgs(['--code', '482913', '--swipe-ms', 'off']).swipeMs).toBe('off');
    expect(parseArgs(['--code', '482913', '--swipe-ms', 'auto']).swipeMs).toBeNull();
    expect(parseArgs(['--code', '482913', '--personality', 'picky']).personality).toBe('picky');
    expect(parseArgs(['--code', '482913', '--personality', 'agreeable']).personality).toBe(
      'agreeable',
    );
  });

  it('accepts the separator mise passes and every option', () => {
    const config = parseArgs([
      '--',
      '--code',
      'abc123',
      '--count',
      '5',
      '--target',
      'staging',
      '--swipe-ms',
      '1500',
      '--like-rate',
      '0.2',
      '--seed',
      '9',
    ]);
    expect(config).toEqual({
      action: 'play',
      as: 'guest',
      code: 'ABC123',
      count: 5,
      target: 'staging',
      swipeMs: 1500,
      likeRate: 0.2,
      seed: 9,
      personality: 'mixed',
    });
  });

  it.each([
    [[], 'code'],
    [['--code', '12'], 'code'],
    [['--code', '482913', '--count', '0'], 'count'],
    [['--code', '482913', '--count', '12'], 'count'],
    [['--code', '482913', '--target', 'production'], 'target'],
    [['--code', '482913', '--swipe-ms', '10'], 'swipe-ms'],
    [['--code', '482913', '--like-rate', '2'], 'like-rate'],
    [['--code', '482913', '--nope', '1'], 'nope'],
    [['--code', '482913', '--seed', '-1'], 'seed'],
    [['--code', '482913', '--seed', 'abc'], 'seed'],
    [['--code', '482913', '--personality', 'grumpy'], 'personality'],
    [['--code'], 'code'],
  ])('refuses %j', (argv, word) => {
    expect(() => parseArgs(argv)).toThrow(UsageError);
    expect(() => parseArgs(argv)).toThrow(word);
  });
});

describe('backends', () => {
  it('reads the local stack from `supabase status -o env`', () => {
    const text =
      'API_URL="http://127.0.0.1:54321"\nPUBLISHABLE_KEY="sb_publishable_x"\nOTHER="y"\n';
    expect(parseStatusEnv(text).OTHER).toBe('y');
    expect(localBackend(text)).toEqual({ url: 'http://127.0.0.1:54321', key: 'sb_publishable_x' });
  });

  it('says so when the local stack is not running', () => {
    expect(() => localBackend('')).toThrow(UsageError);
  });

  it('takes staging from the environment and never from a file', () => {
    expect(
      stagingBackend({ FLIMME_STAGING_URL: 'https://x.example', FLIMME_STAGING_KEY: 'k' }),
    ).toEqual({
      url: 'https://x.example',
      key: 'k',
    });
    expect(() => stagingBackend({})).toThrow(UsageError);
  });
});

describe('the play-again action', () => {
  it('reads the action word and the role', () => {
    const guest = parseArgs(['play-again', '--code', '482913']);
    expect(guest).toMatchObject({ action: 'play-again', as: 'guest', code: '482913' });
    const host = parseArgs(['play-again', '--as', 'host', '--count', '2']);
    expect(host).toMatchObject({ action: 'play-again', as: 'host', count: 2 });
  });

  it('keeps the plain action for a normal run', () => {
    expect(parseArgs(['--code', '482913'])).toMatchObject({ action: 'play', as: 'guest' });
  });

  it('refuses a host role outside the action, and an unknown role', () => {
    expect(() => parseArgs(['--as', 'host'])).toThrow(UsageError);
    expect(() => parseArgs(['play-again', '--as', 'dealer'])).toThrow(UsageError);
  });
});
