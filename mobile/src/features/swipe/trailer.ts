import { Linking } from 'react-native';

import { trailerUrl } from './card-props';

// The trailer opens outside the app (YouTube). A refusal from the system is not an error to show:
// the player is back on the card. Under 13 the server sends no key, so there is no button (M7.3).

export function openTrailerUrl(url: string): void {
  Linking.openURL(url).catch(() => undefined);
}

export function openTrailer(key: string | null | undefined): void {
  if (key) openTrailerUrl(trailerUrl(key));
}

// The Trailer button sits inside the card, whose tap gesture flips it. A touch that starts on the
// button is the button's, so the card ignores a tap that follows one within this window.
const TAP_WINDOW_MS = 700;
let lastTrailerTouch = 0;

export function markTrailerTouch(now: number = Date.now()): void {
  lastTrailerTouch = now;
}

export function isTrailerTap(now: number = Date.now()): boolean {
  return now - lastTrailerTouch < TAP_WINDOW_MS;
}
