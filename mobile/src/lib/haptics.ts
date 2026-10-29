import * as Haptics from 'expo-haptics';

// One function per meaning, so a haptic always says the same thing everywhere.
// See the motion skill and docs/agent-workflow.md#the-motion-system.

let enabled = true;

/** Settings switch. */
export function setHapticsEnabled(value: boolean) {
  enabled = value;
}

function run(play: () => Promise<void>) {
  if (!enabled) return;
  // A device without a haptic engine rejects: that's fine.
  play().catch(() => undefined);
}

export const haptics = {
  /** A card crosses the commit line while being dragged. */
  commit: () => run(() => Haptics.selectionAsync()),
  /** A button, chip or toggle is pressed. */
  press: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** A card is thrown off the stack. */
  throw: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** It's a match, or the winner is revealed. */
  match: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** A veto lands in the Final Cut. */
  veto: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid)),
  /** Each of the countdown's last 5 seconds. */
  countdown: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft)),
  /** A refusal: a wrong code, an action that isn't allowed. */
  error: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};

export type HapticName = keyof typeof haptics;
