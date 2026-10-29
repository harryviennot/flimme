import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { cn } from '@/lib/cn';

// The only place that sets type. The variants are the Figma's 15 text styles, plus five
// component-specific ones the Figma sets by hand.

const variants = {
  'display-xl': 'type-display-xl',
  'display-l': 'type-display-l',
  'display-m': 'type-display-m',
  'display-s': 'type-display-s',
  'title-l': 'type-title-l',
  'title-m': 'type-title-m',
  'body-l': 'type-body-l',
  'body-m': 'type-body-m',
  'body-m-strong': 'type-body-m-strong',
  'body-s': 'type-body-s',
  'mono-data': 'type-mono-data',
  'mono-eyebrow': 'type-mono-eyebrow',
  'mono-code': 'type-mono-code',
  'label-button-l': 'type-label-button-l',
  'label-button-s': 'type-label-button-s',
  // Component-specific styles: only the component named in tokens.json uses each.
  'display-ticket': 'type-display-ticket',
  'display-stamp': 'type-display-stamp',
  'avatar-s': 'type-avatar-s',
  'avatar-m': 'type-avatar-m',
  'avatar-l': 'type-avatar-l',
} as const;

const tones = {
  primary: 'text-text-primary',
  secondary: 'text-text-secondary',
  muted: 'text-text-muted',
  disabled: 'text-text-disabled',
  inverse: 'text-text-inverse',
  'on-accent': 'text-text-on-accent',
  accent: 'text-accent-text',
  marquee: 'text-marquee-default',
  like: 'text-like-default',
  nope: 'text-nope-text',
  neon: 'text-neon-default',
} as const;

const aligns = { left: 'text-left', center: 'text-center', right: 'text-right' } as const;

// Display type is set tight and large: it may grow a little with the system text size,
// not triple, or screens break.
const maxScale: Record<TextVariant, number> = {
  'display-xl': 1.1,
  'display-l': 1.15,
  'display-m': 1.2,
  'display-s': 1.25,
  'label-button-l': 1.2,
  'label-button-s': 1.2,
  'title-l': 1.4,
  'title-m': 1.5,
  'body-l': 1.8,
  'body-m': 1.8,
  'body-m-strong': 1.8,
  'body-s': 1.8,
  'mono-data': 1.5,
  'mono-eyebrow': 1.4,
  'mono-code': 1.4,
  'display-ticket': 1,
  'display-stamp': 1,
  'avatar-s': 1,
  'avatar-m': 1,
  'avatar-l': 1,
};

export type TextVariant = keyof typeof variants;
export type TextTone = keyof typeof tones;

export type TextProps = Omit<RNTextProps, 'style'> & {
  variant?: TextVariant;
  tone?: TextTone;
  align?: keyof typeof aligns;
  /** Layout only (margins, flex). Type and color come from variant and tone. */
  className?: string;
};

export function Text({
  variant = 'body-m',
  tone = 'primary',
  align,
  className,
  maxFontSizeMultiplier,
  ...props
}: TextProps) {
  return (
    <RNText
      {...props}
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? maxScale[variant]}
      className={cn(variants[variant], tones[tone], align && aligns[align], className)}
    />
  );
}
