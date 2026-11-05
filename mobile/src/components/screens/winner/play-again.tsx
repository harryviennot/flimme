import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';

/** The host's Play again (winner.md#play-again): one button, no confirmation. */
export function PlayAgain({ loading, onPress }: { loading: boolean; onPress: () => void }) {
  const { t } = useTranslation('playAgain');
  return (
    <Button
      label={t('playAgain')}
      accessibilityLabel={t('a11y.playAgain')}
      variant="primary"
      size="l"
      block
      icon="refresh"
      loading={loading}
      onPress={onPress}
    />
  );
}
