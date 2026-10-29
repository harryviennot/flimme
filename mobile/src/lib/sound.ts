import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
  type AudioSource,
} from 'expo-audio';

// Decided on 29 October 2026: sound for the match and the finale's reveal only.
// Mixed with other audio so it never pauses the TV or music, and quiet when the phone
// is set to silent. The files come with the sounds content task: until then a sound is
// a no-op.

export type SoundName = 'match' | 'reveal';

const sources: Record<SoundName, AudioSource | null> = {
  match: null,
  reveal: null,
};

let enabled = true;
let modeSet: Promise<void> | null = null;
const players = new Map<SoundName, AudioPlayer>();

/** Settings switch. */
export function setSoundEnabled(value: boolean) {
  enabled = value;
}

function setMode() {
  modeSet ??= setAudioModeAsync({
    playsInSilentMode: false,
    interruptionMode: 'mixWithOthers',
    shouldPlayInBackground: false,
  }).catch(() => undefined);
  return modeSet;
}

export async function playSound(name: SoundName) {
  const source = sources[name];
  if (!enabled || !source) return;
  await setMode();
  let player = players.get(name);
  if (!player) {
    player = createAudioPlayer(source);
    players.set(name, player);
  }
  await player.seekTo(0);
  player.play();
}
