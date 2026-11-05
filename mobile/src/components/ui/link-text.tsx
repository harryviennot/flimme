import { Linking, Platform } from 'react-native';

import { Text, type TextProps } from '@/components/ui/text';

export type LinkTextProps = Omit<TextProps, 'onPress' | 'role' | 'tone'> & {
  /** A full address (https or mailto) or a path on this site. */
  href: string;
  /** What a screen reader says when the text alone is not enough. */
  label?: string;
};

/**
 * A text link. In a browser it is a real anchor (so it can be opened in a new tab or copied);
 * anywhere else it opens through Linking. The legal pages only run in a browser, so the second
 * branch is for the tests and for safety.
 */
export function LinkText({ href, label, children, ...props }: LinkTextProps) {
  const link =
    Platform.OS === 'web' ? ({ href } as object) : { onPress: () => void Linking.openURL(href) };
  return (
    <Text
      {...props}
      {...link}
      role="link"
      tone="accent"
      accessibilityLabel={label}
      className="underline"
    >
      {children}
    </Text>
  );
}
