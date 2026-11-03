import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { IconButton } from '@/components/ui/icon-button';
import { Text } from '@/components/ui/text';

/** The link as text, cut in the middle if it is long, with a copy button. */
export function LinkRow({ display, onCopy }: { display: string; onCopy: () => void }) {
  const { t } = useTranslation('lobby');
  return (
    <View className="flex-row items-center gap-3 rounded-md bg-bg-raised p-4">
      <View className="flex-1" accessible accessibilityLabel={`${t('invite.link')}, ${display}`}>
        <Text variant="mono-data" tone="accent" numberOfLines={1} ellipsizeMode="middle">
          {display}
        </Text>
      </View>
      <IconButton
        icon="copy"
        variant="plain"
        accessibilityLabel={t('invite.copy')}
        onPress={onCopy}
      />
    </View>
  );
}
