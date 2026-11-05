import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, BackHandler } from 'react-native';

import { Pressable } from '@/components/ui/pressable';
import { formatList } from '@/features/lobby/names';
import type { RevealView } from '@/features/finale/use-reveal';
import { duration } from '@/theme/motion';

type Playing = Extract<RevealView, { kind: 'playing' }>;

/** What a screen reader hears at 0: the knocked-out films, then the pick and why. */
export function useRevealAnnouncement(view: Playing | null, language: string): string {
  const { t } = useTranslation('finale');
  if (!view) return '';
  const vetoed = view.vetoedTitles.length
    ? t('reveal.a11y.vetoed', {
        count: view.vetoedTitles.length,
        titles: formatList(view.vetoedTitles, language),
      })
    : '';
  const reason = view.line ? t(`reveal.reason.${view.line}`) : '';
  const title = view.winner?.title;
  const pick = title
    ? t('reveal.a11y.pick', { title, reason })
    : t('reveal.a11y.pickNoTitle', { reason });
  return [vetoed, pick].filter(Boolean).join(' ').trim();
}

/**
 * The reveal's layer over the Final Cut screen: Android's back (consumed until the winner step,
 * then it goes on), the result announced once, and from the winner step a tap anywhere goes on.
 * It sits above the finalists, which take no touches while the reveal plays.
 */
export function Reveal({ view, language }: { view: Playing; language: string }) {
  const { t } = useTranslation('finale');
  const announcement = useRevealAnnouncement(view, language);
  const { stage, goOn } = view;

  // Said once, as soon as the winner's title is here, or after a moment without it.
  const said = useRef(false);
  const latest = useRef(announcement);
  useEffect(() => {
    latest.current = announcement;
  });
  const ready = !!view.winner?.title;
  useEffect(() => {
    if (said.current) return;
    const say = () => {
      if (said.current) return;
      said.current = true;
      AccessibilityInfo.announceForAccessibility(latest.current);
    };
    if (ready) {
      say();
      return;
    }
    const timer = setTimeout(say, duration.slow);
    return () => clearTimeout(timer);
  }, [ready]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      goOn();
      return true;
    });
    return () => subscription.remove();
  }, [goOn]);

  // Mounted only at the winner step, so a touch that started earlier never counts.
  if (stage !== 'winner') return null;
  return (
    <Pressable
      accessibilityLabel={t('reveal.a11y.winner')}
      haptic={false}
      onPress={goOn}
      className="absolute inset-0"
      importantForAccessibility="no"
      accessibilityElementsHidden
      testID="reveal-tap"
    />
  );
}
