import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { EmptyState } from '@/components/ui/empty-state';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';

// A placeholder until M6.45 builds the grid (my-films.md): the title and the Liked empty line.
export default function MyFilmsScreen() {
  const { t } = useTranslation('myFilms');
  return (
    <Screen insetBottom={false}>
      <View className="flex-1 gap-4 pt-2">
        <Text variant="display-m" accessibilityRole="header">
          {t('title')}
        </Text>
        <EmptyState icon="heart" title={t('empty.title')} body={t('empty.liked')} />
      </View>
    </Screen>
  );
}
