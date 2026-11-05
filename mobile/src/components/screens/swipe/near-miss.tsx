import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { Toast } from '@/components/ui/toast';
import type { NearMiss } from '@/features/swipe/near-miss';
import { layout } from '@/theme/motion';

// The near-miss toast (swipe.md#the-near-miss), drawn inline over the top bar's pills, not
// through showToast, so it leaves with its card. Keyed by film: a new count for the same film
// changes the number in place, a new film slides in on its own. No haptic, no sound.
export function SwipeNearMiss({
  titleId,
  nearMiss,
}: {
  titleId: number | undefined;
  nearMiss: NearMiss | null;
}) {
  const { t } = useTranslation('swipe');
  const reduced = useReducedMotion();
  if (!nearMiss || titleId === undefined) return null;
  return (
    <View pointerEvents="none" className="absolute inset-x-5 top-2 z-30">
      <Animated.View
        key={titleId}
        testID="near-miss"
        entering={reduced ? layout.fadeIn : layout.toastIn}
        exiting={reduced ? layout.fadeOut : layout.toastOut}
      >
        <Toast tone="like" title={t('nearMiss', { count: nearMiss.likes, of: nearMiss.of })} />
      </Animated.View>
    </View>
  );
}
