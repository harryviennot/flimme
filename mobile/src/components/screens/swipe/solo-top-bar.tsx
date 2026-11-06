import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { Tag } from '@/components/ui/tag';
import { Text } from '@/components/ui/text';
import { useLeaveSolo } from '@/features/solo/leave';

// The solo top bar (swipe.md#the-solo-top-bar): Leave with no alert, the "Solo" label and, last,
// how many films this session liked. The count is the phone's own answers (the queue included),
// goes down on an undo and opens nothing.
export function SoloTopBar({ roomId, likes }: { roomId: string; likes: number }) {
  const { t } = useTranslation('solo');
  const leave = useLeaveSolo(roomId);
  const shown = new Intl.NumberFormat().format(likes);
  return (
    // The same frame as the room's bar (padding 8, then a 44-point row), so the Leave button, the
    // badge and the count sit on the same line in both and the cards below don't move.
    <View className="flex-row items-center gap-2 px-5 pt-2 pb-2" testID="solo-top-bar">
      <IconButton icon="x" accessibilityLabel={t('a11y.leave')} onPress={leave} />
      <View className="h-11 min-w-0 flex-1 flex-row items-center gap-3" testID="solo-top-bar-row">
        {/* Tag is `self-start`, which would pin it to the row's top: its own wrapper is centred. */}
        <View testID="solo-badge">
          <Tag label={t('topBar.label')} icon="user" />
        </View>
        <View
          className="ml-auto flex-row items-center gap-1.5"
          accessible
          accessibilityLabel={t('a11y.likes', { count: likes })}
          testID="solo-likes"
        >
          <Icon name="heart" size={20} filled color="like-default" />
          <Text variant="mono-data" maxFontSizeMultiplier={1.2}>
            {shown}
          </Text>
        </View>
      </View>
    </View>
  );
}
