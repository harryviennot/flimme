import { haptics } from '@/lib/haptics';
import { playSound } from '@/lib/sound';

/**
 * A match joins the shortlist: the double-tap haptic and the bell, together, on every phone
 * that sees the beat live (sounds.md#a-match-joins-the-shortlist). The read-back of a cold start
 * or a reconnect has no beat, so it plays neither (the controller's tests).
 */
export function shortlistBeatFeedback() {
  haptics.shortlist();
  void playSound('shortlist');
}
