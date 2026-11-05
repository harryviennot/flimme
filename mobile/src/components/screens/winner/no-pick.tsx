import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { EmptyState } from '@/components/ui/empty-state';

/**
 * The body of the winner route for a `done` room that picked nothing (winner.md#nothing-fits-tonight).
 * Nothing was liked, so it says so without blaming anyone. The Home footer is the way out.
 */
export function NoPick() {
  const { t } = useTranslation('ending');
  return (
    <View className="flex-1 justify-center" testID="no-pick">
      <EmptyState icon="film" title={t('noPick.title')} body={t('noPick.body')} autoFocus />
    </View>
  );
}
