import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '@/components/ui/icon-button';

/**
 * The frame of a sheet that fits its contents (the seat and report sheets): the canvas, a close
 * button for screen readers at the top right, and room for the home indicator. `Screen` adds
 * the status bar's inset, which a sheet doesn't need.
 */
export function SheetFrame({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const { t } = useTranslation('common');
  const insets = useSafeAreaInsets();
  return (
    <View className="bg-bg-canvas px-5" style={{ paddingBottom: Math.max(insets.bottom, 20) }}>
      <View className="items-end pt-3">
        <IconButton
          icon="x"
          variant="plain"
          accessibilityLabel={t('actions.close')}
          onPress={onClose}
        />
      </View>
      {children}
    </View>
  );
}
