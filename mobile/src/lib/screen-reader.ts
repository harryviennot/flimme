import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** Whether a screen reader (VoiceOver, TalkBack) is on, kept current while mounted. */
export function useScreenReader(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isScreenReaderEnabled()
      .then((enabled) => live && setOn(enabled))
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', setOn);
    return () => {
      live = false;
      subscription.remove();
    };
  }, []);
  return on;
}
