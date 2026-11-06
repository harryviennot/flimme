import { AccessibilityInfo } from 'react-native';

import i18n from '@/i18n';

/** Tells a screen reader what the bookmark just did, politely (it has no toast). */
export function announceSaved(title: string, saved: boolean): void {
  AccessibilityInfo.announceForAccessibility(
    i18n.t(saved ? 'swipe:a11y.saved' : 'swipe:a11y.unsaved', { title }),
  );
}
