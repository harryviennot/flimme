import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
  type AudioSource,
} from 'expo-audio';

// Every in-app sound, its moment and its phones: docs/design/sounds.md (6 November 2026).
// Mixed with other audio so it never pauses the TV or music, played even when the phone is set
// to silent (Harry, 6 November 2026), nothing in the background. Every button press ticks. The Sound switch in Settings turns all of them off. The
// files carry their own levels, so the volume is always 1 and is never set here. `notify.wav`
// belongs to M15.5's notification and `sonic-logo.wav` to the preview video: neither is
// required here, and a test keeps it that way.

export const ARRIVE_MIN = 2;
export const ARRIVE_MAX = 10;

export type ArriveSound = `arrive-${2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10}`;
export type CountdownSound = 'countdown' | 'countdown-last';
export type SoundName =
  'match' | 'reveal' | 'start' | 'error' | 'tap' | CountdownSound | ArriveSound;

const sources: Record<SoundName, AudioSource> = {
  match: require('../../assets/sounds/match.wav'),
  reveal: require('../../assets/sounds/reveal.wav'),
  start: require('../../assets/sounds/start.wav'),
  error: require('../../assets/sounds/error.wav'),
  tap: require('../../assets/sounds/tap.wav'),
  countdown: require('../../assets/sounds/countdown.wav'),
  'countdown-last': require('../../assets/sounds/countdown-last.wav'),
  'arrive-2': require('../../assets/sounds/arrive-2.wav'),
  'arrive-3': require('../../assets/sounds/arrive-3.wav'),
  'arrive-4': require('../../assets/sounds/arrive-4.wav'),
  'arrive-5': require('../../assets/sounds/arrive-5.wav'),
  'arrive-6': require('../../assets/sounds/arrive-6.wav'),
  'arrive-7': require('../../assets/sounds/arrive-7.wav'),
  'arrive-8': require('../../assets/sounds/arrive-8.wav'),
  'arrive-9': require('../../assets/sounds/arrive-9.wav'),
  'arrive-10': require('../../assets/sounds/arrive-10.wav'),
};

/** Which sounds are made when: the app launch, the room layout, the Final Cut. */
export type SoundGroup = 'launch' | 'room' | 'finale';

export const GROUPS: Record<SoundGroup, readonly SoundName[]> = {
  launch: ['tap', 'error'],
  room: [
    'match',
    'reveal',
    'start',
    'arrive-2',
    'arrive-3',
    'arrive-4',
    'arrive-5',
    'arrive-6',
    'arrive-7',
    'arrive-8',
    'arrive-9',
    'arrive-10',
  ],
  finale: ['countdown', 'countdown-last'],
};

/** The arrival note for the seats the lobby lists after it (2 to 10; more or fewer clamp). */
export function arriveSoundFor(seats: number): ArriveSound {
  const n = Math.min(ARRIVE_MAX, Math.max(ARRIVE_MIN, Math.round(seats)));
  return `arrive-${n}` as ArriveSound;
}

/** The tick for the seconds left: the low one for 5, 4 and 3, the high one for 2 and 1. */
export function countdownSoundFor(secondsLeft: number): CountdownSound {
  return secondsLeft <= 2 ? 'countdown-last' : 'countdown';
}

let enabled = true;
let modeSet: Promise<void> | null = null;
const players = new Map<SoundName, AudioPlayer>();

/** Settings switch. */
export function setSoundEnabled(value: boolean) {
  enabled = value;
}

function setMode() {
  modeSet ??= setAudioModeAsync({
    playsInSilentMode: true,
    interruptionMode: 'mixWithOthers',
    shouldPlayInBackground: false,
  }).catch(() => undefined);
  return modeSet;
}

function playerFor(name: SoundName): AudioPlayer | null {
  let player = players.get(name);
  if (!player) {
    player = createAudioPlayer(sources[name]);
    // A device or a test with no audio gives nothing back: the sound is a no-op.
    if (!player) return null;
    // Rewound as soon as it ends, so the next play starts at once with no seek in the way.
    player.addListener?.('playbackStatusUpdate', (status) => {
      if (status.didJustFinish) void player?.seekTo(0).catch(() => undefined);
    });
    players.set(name, player);
  }
  return player;
}

/** Makes the players of a group ahead of time, so a tick or a chord starts without a delay. */
export function preloadSounds(group: SoundGroup) {
  void setMode();
  for (const name of GROUPS[group]) {
    try {
      playerFor(name);
    } catch {
      // A sound that can't be made is a sound that doesn't play.
    }
  }
}

/** Frees the players of a group (the room ended). */
export function releaseSounds(group: SoundGroup) {
  for (const name of GROUPS[group]) {
    const player = players.get(name);
    if (!player) continue;
    players.delete(name);
    try {
      player.remove();
    } catch {
      // Already gone.
    }
  }
}

/** Plays a sound from its start; a sound already playing restarts, nothing queues. */
export async function playSound(name: SoundName) {
  if (!enabled) return;
  try {
    await setMode();
    const player = playerFor(name);
    if (!player) return;
    // A sound that was just made or has finished sits at 0: play without waiting for a seek.
    if (player.currentTime > 0) await player.seekTo(0);
    player.play();
  } catch {
    // Never let a sound break the moment it goes with.
  }
}
