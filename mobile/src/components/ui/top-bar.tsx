import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { IconButton } from './icon-button';
import type { IconName } from './icon';
import { Text } from './text';

export type TopBarProps = {
  title?: string;
  /** Shows the back button. */
  onBack?: () => void;
  /** One optional action on the right. */
  action?: { icon: IconName; accessibilityLabel: string; onPress: () => void };
};

/** Figma "Top bar": back on the left, one action on the right, the title centred. */
export function TopBar({ title, onBack, action }: TopBarProps) {
  const { t } = useTranslation();
  return (
    <View className="h-14 flex-row items-center gap-2 px-3">
      {onBack ? (
        <IconButton icon="chevron-left" accessibilityLabel={t('actions.back')} onPress={onBack} />
      ) : (
        <View className="size-10" />
      )}
      <Text
        variant="title-m"
        align="center"
        className="flex-1"
        numberOfLines={1}
        accessibilityRole="header"
      >
        {title}
      </Text>
      {action ? (
        <IconButton
          icon={action.icon}
          accessibilityLabel={action.accessibilityLabel}
          onPress={action.onPress}
        />
      ) : (
        <View className="size-10" />
      )}
    </View>
  );
}
