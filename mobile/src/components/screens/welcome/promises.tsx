import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Icon, type IconName } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

const promises = [
  { icon: 'users', key: 'room' },
  { icon: 'tv', key: 'services' },
  { icon: 'eye', key: 'seen' },
] as const satisfies readonly { icon: IconName; key: string }[];

/** The three promises, one screen-reader element each. */
export function Promises() {
  const { t } = useTranslation('onboarding');
  return (
    <View className="gap-3">
      {promises.map(({ icon, key }) => (
        <View key={key} accessible className="flex-row items-center gap-3">
          <View className="size-9 items-center justify-center rounded-sm bg-bg-raised">
            <Icon name={icon} size={20} color="accent-text" />
          </View>
          <Text variant="body-m" className="flex-1">
            {t(`welcome.promises.${key}`)}
          </Text>
        </View>
      ))}
    </View>
  );
}
