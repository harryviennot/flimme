import { ClipboardPasteButton, getStringAsync, isPasteButtonAvailable } from 'expo-clipboard';
import { useTranslation } from 'react-i18next';
import { Platform, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { tokens } from '@/theme/generated/tokens';

export type PasteButtonProps = {
  /** The pasted text, whatever it is: the screen reads the digits or the invite link. */
  onPaste: (text: string) => void;
};

/**
 * iOS 16 and later: the system's paste control, which pastes without the "allow paste" alert.
 * Otherwise a ghost button that reads the clipboard only when it is tapped.
 */
export function PasteButton({ onPaste }: PasteButtonProps) {
  const { t } = useTranslation('join');
  if (Platform.OS === 'ios' && isPasteButtonAvailable) {
    return (
      <View className="self-start">
        <ClipboardPasteButton
          acceptedContentTypes={['plain-text']}
          displayMode="iconAndLabel"
          cornerStyle="capsule"
          backgroundColor={tokens.color['bg-raised']}
          foregroundColor={tokens.color['text-primary']}
          style={{ height: tokens.space['40'], width: tokens.space['40'] * 3 }}
          onPress={(data) => {
            if (data.type === 'text') onPaste(data.text);
          }}
        />
      </View>
    );
  }
  return (
    <Button
      label={t('paste')}
      variant="ghost"
      size="s"
      icon="copy"
      onPress={() => {
        getStringAsync()
          .then(onPaste)
          .catch(() => undefined);
      }}
    />
  );
}
