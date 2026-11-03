import { AVATAR_KEYS } from '@flimme/contract';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AvatarPicker } from '@/components/ui/avatar-picker';
import type { AvatarColor } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { initialOf, NAME_MAX } from '@/lib/player-name';

export type NameFormProps = {
  name: string;
  color: AvatarColor;
  /** Already translated; replaces the helper under the field. */
  error?: string;
  onChangeName: (name: string) => void;
  onChangeColor: (color: AvatarColor) => void;
  autoFocus?: boolean;
};

/** The color row and the name field. Controlled; the screen that uses it saves. */
export function NameForm({
  name,
  color,
  error,
  onChangeName,
  onChangeColor,
  autoFocus,
}: NameFormProps) {
  const { t } = useTranslation('onboarding');
  return (
    <View className="gap-6 self-stretch">
      <View className="gap-3">
        <Text variant="mono-eyebrow" tone="secondary">
          {t('name.colorLabel')}
        </Text>
        <AvatarPicker
          colors={AVATAR_KEYS}
          value={color}
          onChange={onChangeColor}
          initial={initialOf(name)}
          label={t('name.colorLabel')}
        />
      </View>
      <Input
        label={t('name.nameLabel')}
        helper={t('name.helper')}
        error={error}
        value={name}
        onChangeText={onChangeName}
        maxLength={NAME_MAX}
        autoCapitalize="words"
        autoCorrect={false}
        textContentType="nickname"
        autoFocus={autoFocus}
      />
    </View>
  );
}
