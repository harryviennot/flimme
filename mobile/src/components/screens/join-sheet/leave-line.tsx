import { useTranslation } from 'react-i18next';
import Animated from 'react-native-reanimated';

import { Text } from '@/components/ui/text';
import type { LeaveLine as LeaveLineValue } from '@/features/join/leave-line';
import { layout } from '@/theme/motion';

/** "You'll leave Harry's room", centred under Join (join-sheet.md#the-leave-line-m410). */
export function LeaveLine({ line }: { line: NonNullable<LeaveLineValue> }) {
  const { t } = useTranslation('join');
  return (
    <Animated.View entering={layout.fadeIn} exiting={layout.fadeOut}>
      <Text variant="body-s" tone="muted" align="center">
        {line.kind === 'host' ? t('link.leaveRoom', { name: line.name }) : t('link.leaveOtherRoom')}
      </Text>
    </Animated.View>
  );
}
