import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { SvgXml } from 'react-native-svg';

import { Spotlight } from '@/components/ui/gradients';
import { Text } from '@/components/ui/text';
import splash from '@/theme/splash.json';
import { logos } from '@/theme/generated/icons';
import { duration, layout } from '@/theme/motion';

const BRAND = 'Flimme';
const logoWidth = Platform.OS === 'android' ? splash.logoWidth.android : splash.logoWidth.ios;
const logoHeight = (logoWidth * splash.logoViewBox.height) / splash.logoViewBox.width;

export type SplashViewProps = {
  /** Still waiting after the slow threshold: the tagline says so. */
  slow?: boolean;
};

/**
 * The hand-off from the native splash: the logo drawn where the native image sits, centred in
 * the whole window, so the switch is invisible. The spotlight and the tagline come in only if
 * the wait outlasts `duration.base`; when everything is ready sooner the next screen simply
 * shows (splash.md#states). No haptic, no sound.
 */
export function SplashView({ slow = false }: SplashViewProps) {
  const { t } = useTranslation('onboarding');
  const { t: tc } = useTranslation('common');
  const reduceMotion = useReducedMotion();
  const [lit, setLit] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setLit(true), duration.base);
    return () => clearTimeout(timer);
  }, []);

  const entering = reduceMotion ? undefined : layout.fadeIn;
  const exiting = reduceMotion ? undefined : layout.fadeOut;

  return (
    <View
      className="flex-1 bg-bg-canvas"
      accessible
      accessibilityLabel={`${BRAND}, ${tc('states.loading')}`}
    >
      {lit ? (
        <Animated.View
          testID="splash-spotlight"
          className="absolute inset-0"
          pointerEvents="none"
          entering={entering}
          exiting={exiting}
        >
          <Spotlight tone="accent" />
        </Animated.View>
      ) : null}
      <View className="flex-1 items-center justify-center">
        <View style={{ width: logoWidth, height: logoHeight }}>
          <SvgXml
            xml={logos.flimme}
            width={logoWidth}
            height={logoHeight}
            accessibilityLabel={BRAND}
            accessibilityRole="image"
          />
          {lit ? (
            <Animated.View
              testID="splash-tagline"
              className="absolute inset-x-0 top-full items-center"
              entering={entering}
              exiting={exiting}
            >
              <Text variant="mono-eyebrow" tone="muted" align="center">
                {slow ? t('splash.slow') : t('splash.tagline')}
              </Text>
            </Animated.View>
          ) : null}
        </View>
      </View>
    </View>
  );
}
