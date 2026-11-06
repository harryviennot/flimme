import { useTranslation } from 'react-i18next';
import type { Ref } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import type { PressableNode } from '@/components/ui/pressable';
import { MarqueeBulbs } from '@/components/ui/marquee-bulbs';
import { Text } from '@/components/ui/text';

export type LobbyFooterProps =
  | {
      role: 'host';
      starting: boolean;
      disabled: boolean;
      /** The line under the button: who is missing, or who is away. */
      helper: string | null;
      /** Why the button is disabled when no line says so (the banner's message). */
      hint?: string;
      /** Focus goes back here after a refused Start (lobby.md#accessibility). */
      startRef?: Ref<PressableNode>;
      /** The line answers the host's tap: Android reads it at once (iOS gets an announcement). */
      assertive?: boolean;
      onStart: () => void;
    }
  | { role: 'guest'; hostName: string };

/** The lobby's footer: Start for the host, the waiting line for everyone else. */
export function LobbyFooter(props: LobbyFooterProps) {
  const { t } = useTranslation('lobby');
  if (props.role === 'guest') {
    return (
      <View className="items-center gap-3 pb-2">
        <MarqueeBulbs count={12} />
        <Text variant="body-m" tone="secondary" align="center">
          {t('waiting', { name: props.hostName })}
        </Text>
      </View>
    );
  }
  return (
    <View className="gap-2">
      <Button
        label={t('start.cta')}
        sound="tap"
        icon="play"
        size="l"
        block
        disabled={props.disabled}
        loading={props.starting}
        accessibilityHint={props.helper ?? props.hint}
        focusRef={props.startRef}
        onPress={props.onStart}
      />
      {props.helper ? (
        <Text
          variant="body-s"
          tone="muted"
          align="center"
          accessibilityLiveRegion={props.assertive ? 'assertive' : 'none'}
        >
          {props.helper}
        </Text>
      ) : null}
    </View>
  );
}
