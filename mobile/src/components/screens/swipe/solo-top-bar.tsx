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
    <View className="h-14 flex-row items-center gap-3 px-5">
      <IconButton icon="x" accessibilityLabel={t('a11y.leave')} onPress={leave} />
      <Tag label={t('topBar.label')} icon="user" />
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
  );
}
