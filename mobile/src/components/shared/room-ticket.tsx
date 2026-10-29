import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Svg, { Line } from 'react-native-svg';

import { Text } from '@/components/ui/text';
import { tokens } from '@/theme/generated/tokens';

export type RoomTicketProps = {
  /** Six digits. Shown as "482 913". */
  code: string;
  /** "3 of 10 players" */
  leftDetail: string;
  /** "Host · Harry" */
  rightDetail: string;
};

/** Figma "Room ticket": the room code as a cinema ticket, readable across a couch. */
export function RoomTicket({ code, leftDetail, rightDetail }: RoomTicketProps) {
  const { t } = useTranslation();
  const spaced = code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
  return (
    <View className="self-stretch overflow-hidden rounded-lg border border-marquee-strong bg-bg-surface elevation-card">
      <View className="items-center gap-1 px-5 pt-5.5 pb-2">
        <Text variant="mono-eyebrow" tone="marquee">
          {t('ticket.roomCode')}
        </Text>
        <Text variant="display-ticket" accessibilityLabel={code.split('').join(' ')}>
          {spaced}
        </Text>
      </View>
      <View className="h-6 justify-center">
        <Svg height={2} width="100%">
          <Line
            x1="24"
            y1="1"
            x2="100%"
            y2="1"
            stroke={tokens.color['bg-sunken']}
            strokeWidth={2}
            strokeDasharray="6 6"
          />
        </Svg>
        <View className="absolute -left-3.25 size-6 rounded-pill border border-marquee-strong bg-bg-canvas" />
        <View className="absolute -right-3.25 size-6 rounded-pill border border-marquee-strong bg-bg-canvas" />
      </View>
      <View className="flex-row justify-between px-5 pt-2 pb-4.5">
        <Text variant="mono-data" tone="secondary">
          {leftDetail}
        </Text>
        <Text variant="mono-data" tone="secondary">
          {rightDetail}
        </Text>
      </View>
    </View>
  );
}
