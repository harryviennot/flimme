import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Text } from '@/components/ui/text';

/** The solo pick when none of the player's services has the film any more (winner.md#the-solo-pick). */
export function SoloNotListed() {
  const { t } = useTranslation('solo');
  const { t: tw } = useTranslation('winner');
  return (
    <View className="items-center gap-2 pt-2">
      <Text variant="mono-eyebrow" tone="secondary" accessibilityRole="header">
        {tw('whereToWatch')}
      </Text>
      <Text variant="body-m" tone="secondary" align="center">
        {t('pick.notListed')}
      </Text>
      <Text variant="body-s" tone="muted" align="center">
        {tw('justwatch')}
      </Text>
    </View>
  );
}
