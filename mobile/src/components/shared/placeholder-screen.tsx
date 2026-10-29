import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';

export type PlaceholderScreenProps = {
  /** The screen's working name, until its task builds it. */
  title: string;
  /** The roadmap task that builds it, e.g. "M4.11". */
  task: string;
};

/** Stands in for a screen until its roadmap task replaces it. Routes work from day one. */
export function PlaceholderScreen({ title, task }: PlaceholderScreenProps) {
  const { t } = useTranslation();
  return (
    <Screen>
      <View className="flex-1 justify-center gap-3">
        <Text variant="mono-eyebrow" tone="marquee">
          {task}
        </Text>
        <Text variant="display-m">{title}</Text>
        <Text tone="secondary">{t('placeholder.body', { task })}</Text>
      </View>
    </Screen>
  );
}
