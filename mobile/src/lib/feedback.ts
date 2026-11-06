import { haptics } from './haptics';
import { playSound } from './sound';

/**
 * A refusal of the player's own action: the error haptic and the error sound, at the same
 * instant (docs/design/sounds.md#errors-and-refusals). Every screen and hook calls this, never
 * `haptics.error()` alone; a test keeps it that way. The two switches stay separate.
 */
export function errorFeedback() {
  haptics.error();
  void playSound('error');
}
