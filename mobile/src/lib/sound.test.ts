import fs from 'node:fs';
import path from 'node:path';

import * as ExpoAudio from 'expo-audio';

import {
  arriveSoundFor,
  countdownSoundFor,
  GROUPS,
  playSound,
  preloadSounds,
  releaseSounds,
  setSoundEnabled,
} from './sound';

type FakePlayer = {
  currentTime: number;
  play: jest.Mock;
  seekTo: jest.Mock;
  remove: jest.Mock;
  addListener: jest.Mock;
  volume?: number;
};

const created: FakePlayer[] = [];

beforeEach(() => {
  created.length = 0;
  jest.mocked(ExpoAudio.createAudioPlayer).mockImplementation((() => {
    const player: FakePlayer = {
      currentTime: 0,
      play: jest.fn(),
      seekTo: jest.fn(async () => undefined),
      remove: jest.fn(),
      addListener: jest.fn(),
    };
    created.push(player);
    return player;
  }) as never);
  setSoundEnabled(true);
});

afterEach(() => {
  for (const group of Object.keys(GROUPS) as (keyof typeof GROUPS)[]) releaseSounds(group);
});

describe('the files', () => {
  it('maps the seat count to the arrival file, clamped to 2..10', () => {
    expect(arriveSoundFor(2)).toBe('arrive-2');
    expect(arriveSoundFor(5)).toBe('arrive-5');
    expect(arriveSoundFor(10)).toBe('arrive-10');
    expect(arriveSoundFor(1)).toBe('arrive-2');
    expect(arriveSoundFor(13)).toBe('arrive-10');
  });

  it('maps the seconds left to the countdown file', () => {
    expect([5, 4, 3].map(countdownSoundFor)).toEqual(['countdown', 'countdown', 'countdown']);
    expect([2, 1].map(countdownSoundFor)).toEqual(['countdown-last', 'countdown-last']);
  });
});

describe('playing', () => {
  it('plays a sound from its start', async () => {
    await playSound('match');
    expect(created).toHaveLength(1);
    expect(created[0]?.play).toHaveBeenCalledTimes(1);
    expect(created[0]?.seekTo).not.toHaveBeenCalled();
  });

  it('restarts a sound that is still playing, without a queue', async () => {
    await playSound('error');
    const player = created[0];
    if (!player) throw new Error('no player');
    player.currentTime = 0.2;
    await playSound('error');
    expect(created).toHaveLength(1);
    expect(player.seekTo).toHaveBeenCalledWith(0);
    expect(player.play).toHaveBeenCalledTimes(2);
  });

  it('plays nothing with the Sound switch off', async () => {
    setSoundEnabled(false);
    await playSound('match');
    await playSound('tap');
    expect(created.flatMap((p) => p.play.mock.calls)).toHaveLength(0);
    setSoundEnabled(true);
    await playSound('tap');
    expect(created.flatMap((p) => p.play.mock.calls)).toHaveLength(1);
  });

  it('keeps the audio mode: mixed with others, quiet on silent, nothing in the background', async () => {
    let audio: typeof ExpoAudio | undefined;
    let fresh: typeof import('./sound') | undefined;
    jest.isolateModules(() => {
      /* eslint-disable @typescript-eslint/no-require-imports */
      audio = require('expo-audio');
      fresh = require('./sound');
      /* eslint-enable @typescript-eslint/no-require-imports */
    });
    jest.mocked(audio!.createAudioPlayer).mockReturnValue({
      currentTime: 0,
      play: jest.fn(),
      seekTo: jest.fn(),
      remove: jest.fn(),
      addListener: jest.fn(),
    } as never);
    await fresh!.playSound('tap');
    expect(audio!.setAudioModeAsync).toHaveBeenCalledWith({
      playsInSilentMode: false,
      interruptionMode: 'mixWithOthers',
      shouldPlayInBackground: false,
    });
  });

  it('never throws, even with no audio on the device', async () => {
    jest.mocked(ExpoAudio.createAudioPlayer).mockReturnValue(undefined as never);
    await expect(playSound('match')).resolves.toBeUndefined();
  });

  it('never sets a volume: the files carry their levels', () => {
    const source = fs.readFileSync(path.join(__dirname, 'sound.ts'), 'utf8');
    expect(source).not.toMatch(/\.volume\s*=|setVolume|volume:/);
  });
});

describe('preloading', () => {
  it('makes the launch sounds first, then the room and the Final Cut when asked', () => {
    preloadSounds('launch');
    expect(created).toHaveLength(GROUPS.launch.length);
    preloadSounds('room');
    preloadSounds('finale');
    expect(created).toHaveLength(GROUPS.launch.length + GROUPS.room.length + GROUPS.finale.length);
  });

  it('makes a group once, and frees it when the room ends', () => {
    preloadSounds('finale');
    preloadSounds('finale');
    expect(created).toHaveLength(2);
    releaseSounds('finale');
    expect(created.every((p) => p.remove.mock.calls.length === 1)).toBe(true);
    preloadSounds('finale');
    expect(created).toHaveLength(4);
  });
});

describe('the bundle', () => {
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return /\.(ts|tsx|js|json)$/.test(entry.name) && !/\.test\./.test(entry.name) ? [full] : [];
    });

  it('never requires sonic-logo.wav', () => {
    const mobile = path.join(__dirname, '..', '..');
    const files = [...walk(path.join(mobile, 'src')), path.join(mobile, 'app.config.ts')];
    const offenders = files.filter((f) =>
      /(require|import|from)[^\n]*sonic-logo|sounds:\s*\[[^\]]*sonic-logo/.test(
        fs.readFileSync(f, 'utf8'),
      ),
    );
    expect(offenders).toEqual([]);
  });

  it('keeps notify.wav for the reminder (M15.5): not required by the sound module', () => {
    const source = fs.readFileSync(path.join(__dirname, 'sound.ts'), 'utf8');
    expect(source).not.toMatch(/require\([^)]*notify\.wav/);
  });
});
