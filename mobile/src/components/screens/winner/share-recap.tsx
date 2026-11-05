import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';

/**
 * The entry to the recap sheet (winner.md#share-recap): a group pick only, on every phone. It
 * sits in the pick block, so it arrives with the late card's fade.
 */
export function ShareRecap({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation('recap');
  return (
    <View className="items-center pt-1">
      <Button
        label={t('entry')}
        accessibilityLabel={t('a11y.entry')}
        variant="secondary"
        size="s"
        icon="share"
        onPress={onPress}
      />
    </View>
  );
}
