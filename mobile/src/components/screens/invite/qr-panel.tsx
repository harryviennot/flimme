import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import QRCode from 'react-native-qrcode-svg';

import { tokens } from '@/theme/generated/tokens';
import { layout } from '@/theme/motion';

const QR_SIZE = 180;

/** The invite link as a QR code: dark modules on a light square, with the accent glow. */
export function QrPanel({ link }: { link: string }) {
  const { t } = useTranslation('lobby');
  return (
    <Animated.View entering={layout.fadeIn}>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={t('invite.qr')}
        className="rounded-lg bg-text-primary p-4 glow-accent"
      >
        <QRCode
          value={link}
          size={QR_SIZE}
          color={tokens.color['text-inverse']}
          backgroundColor={tokens.color['text-primary']}
        />
      </View>
    </Animated.View>
  );
}
