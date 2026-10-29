import { View } from 'react-native';

import { cn } from '@/lib/cn';
import type { ColorToken } from '@/theme/generated/tokens';

import { Icon, type IconName } from './icon';
import { Text, type TextTone } from './text';

export type TagTone = 'neutral' | 'accent' | 'like' | 'nope' | 'marquee' | 'wildcard';

const tones: Record<TagTone, { bg: string; text: TextTone; icon: ColorToken }> = {
  neutral: { bg: 'bg-bg-raised', text: 'secondary', icon: 'text-secondary' },
  accent: { bg: 'bg-accent-soft', text: 'accent', icon: 'accent-text' },
  like: { bg: 'bg-like-soft', text: 'like', icon: 'like-default' },
  nope: { bg: 'bg-nope-soft', text: 'nope', icon: 'nope-text' },
  marquee: { bg: 'bg-marquee-soft', text: 'marquee', icon: 'marquee-default' },
  wildcard: { bg: 'bg-neon-soft', text: 'neon', icon: 'neon-default' },
};

export type TagProps = {
  label: string;
  tone?: TagTone;
  icon?: IconName;
};

/** Figma "Tag": a small uppercase label (services, reasons, "1st choice"). Wildcard marks exploration cards. */
export function Tag({ label, tone = 'neutral', icon }: TagProps) {
  const look = tones[tone];
  return (
    <View className={cn('h-6 flex-row items-center gap-1 self-start rounded-xs px-2', look.bg)}>
      {icon ? <Icon name={icon} size={14} color={look.icon} /> : null}
      <Text variant="mono-eyebrow" tone={look.text} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}
