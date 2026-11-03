import { REPORT_REASONS, type ReportReason } from '@flimme/contract';
import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { api } from '@/api';
import { SheetFrame } from '@/components/screens/room/sheet-frame';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { OptionCard } from '@/components/ui/option-card';
import { Text } from '@/components/ui/text';
import { showToast } from '@/components/ui/toast';
import { runReport } from '@/features/lobby/report';
import { useOnline } from '@/features/network';
import { SEATS_KEY, useMySeat, useRoomSeats } from '@/features/room';
import { haptics } from '@/lib/haptics';
import { layout } from '@/theme/motion';

const REASON_KEYS = {
  offensive_name: { key: 'offensiveName', icon: 'alert' },
  spam: { key: 'spam', icon: 'zap' },
  other: { key: 'other', icon: 'info' },
} as const satisfies Record<ReportReason, { key: string; icon: 'alert' | 'zap' | 'info' }>;

/** Report a player (docs/design/screens/report-sheet.md): a fixed reason, one tap to send. */
export default function RoomReportSheet() {
  const { id, memberId } = useLocalSearchParams<{ id: string; memberId: string }>();
  const { t } = useTranslation('report');
  const { t: tg } = useTranslation();
  const client = useQueryClient();
  const online = useOnline();
  const seats = useRoomSeats(id);
  const me = useMySeat(id);
  const name = seats.data?.find((s) => s.member_id === memberId)?.display_name ?? '';

  const [reason, setReason] = useState<ReportReason | null>(null);
  const [sending, setSending] = useState(false);
  const [limited, setLimited] = useState(false);
  const [sent, setSent] = useState(false);
  const busy = useRef(false);

  const close = () => router.back();

  const send = async () => {
    if (busy.current || !reason || !online) return;
    busy.current = true;
    setSending(true);
    setLimited(false);
    const outcome = await runReport(api.reportMember, {
      roomId: id ?? '',
      memberId: memberId ?? '',
      reason,
    });
    busy.current = false;
    setSending(false);
    switch (outcome.kind) {
      case 'sent':
        setSent(true);
        return;
      case 'rate_limited':
        setLimited(true);
        haptics.error();
        return;
      case 'not_in_room':
        void client.invalidateQueries({ queryKey: SEATS_KEY(id ?? '') });
        showToast({ tone: 'warn', title: tg('errors.generic.title') });
        close();
        return;
      case 'failed':
        showToast({ tone: 'warn', title: t('errors.generic') });
        return;
    }
  };

  if (sent) {
    return (
      <SheetFrame onClose={close}>
        <Animated.View entering={layout.fadeIn}>
          <EmptyState
            icon="check"
            autoFocus
            title={t('thanks.title')}
            body={me?.role === 'host' ? t('thanks.bodyHost', { name }) : t('thanks.body')}
            action={{ label: t('thanks.done'), onPress: close }}
          />
        </Animated.View>
      </SheetFrame>
    );
  }

  return (
    <SheetFrame onClose={close}>
      <View className="gap-4 pb-5">
        <View accessible accessibilityRole="header">
          <Text variant="display-s">{t('title', { name })}</Text>
        </View>
        <Text variant="body-s" tone="secondary">
          {t('helper')}
        </Text>
        <View className="gap-3" accessibilityRole="radiogroup">
          {REPORT_REASONS.map((r) => {
            const { key, icon } = REASON_KEYS[r];
            return (
              <OptionCard
                key={r}
                icon={icon}
                title={t(`reasons.${key}.title`)}
                description={t(`reasons.${key}.description`)}
                selected={reason === r}
                onPress={sending ? undefined : () => setReason(r)}
              />
            );
          })}
        </View>
        <View className="gap-2">
          <Button
            label={t('send')}
            size="l"
            block
            disabled={!reason || !online}
            loading={sending}
            onPress={() => void send()}
          />
          {!online ? (
            <Text variant="body-s" tone="muted" align="center">
              {t('errors.offline')}
            </Text>
          ) : limited ? (
            <View accessibilityLiveRegion="polite">
              <Text variant="body-s" tone="nope" align="center">
                {t('errors.rateLimited')}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </SheetFrame>
  );
}
