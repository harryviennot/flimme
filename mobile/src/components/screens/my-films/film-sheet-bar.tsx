import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Chip } from '@/components/ui/chip';
import { IconButton } from '@/components/ui/icon-button';

export type FilmSheetBarProps = {
  seen: boolean;
  /** The card has come: the chip shows. Before that the bar holds Close only. */
  showSeen: boolean;
  /** Remove is for a film in Liked only. */
  showRemove: boolean;
  /** Offline, or a write on its way. */
  disabled: boolean;
  onToggleSeen: () => void;
  onRemove: () => void;
  onClose: () => void;
};

/**
 * The film sheet's top bar (film-sheet.md): Seen and Remove from Liked on the left, Close on the
 * right, kept apart by a spacer so the destructive icon never sits beside Close.
 */
export function FilmSheetBar({
  seen,
  showSeen,
  showRemove,
  disabled,
  onToggleSeen,
  onRemove,
  onClose,
}: FilmSheetBarProps) {
  const { t } = useTranslation('myFilms');
  const { t: tc } = useTranslation();
  return (
    <View className="flex-row items-center gap-2 bg-bg-canvas px-5 pt-3 pb-2">
      {showSeen ? (
        <Chip
          label={t('sheet.seen')}
          selected={seen}
          role="checkbox"
          disabled={disabled}
          onPress={onToggleSeen}
        />
      ) : null}
      {showRemove ? (
        <IconButton
          icon="trash"
          variant="plain"
          color="text-secondary"
          accessibilityLabel={t('sheet.remove')}
          disabled={disabled}
          onPress={onRemove}
        />
      ) : null}
      <View className="flex-1" />
      <IconButton
        icon="x"
        variant="plain"
        accessibilityLabel={tc('actions.close')}
        onPress={onClose}
      />
    </View>
  );
}
