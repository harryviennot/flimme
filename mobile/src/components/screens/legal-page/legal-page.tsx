import i18n from '@/i18n';
import { ScrollView, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { Spotlight } from '@/components/ui/gradients';
import { Text } from '@/components/ui/text';
import { plainText, parseMarkdown } from '@/features/legal/markdown';
import {
  formatUpdated,
  legalPageIds,
  legalPath,
  type LegalLocation,
  otherLanguage,
  otherLanguagePath,
} from '@/features/legal/pages';
import { logos } from '@/theme/generated/icons';
import splash from '@/theme/splash.json';

import { LinkText } from '@/components/ui/link-text';
import { MarkdownView } from './markdown-view';

const LOGO_WIDTH = 120;
const LOGO_HEIGHT = (LOGO_WIDTH * splash.logoViewBox.height) / splash.logoViewBox.width;
const BRAND = 'Flimme';

export type LegalPageProps = {
  location: LegalLocation;
  markdown: string;
  /** ISO date of the text's last change. */
  updated: string;
};

/** The title of a text: its one `#` line. */
export function legalTitle(markdown: string): string {
  const title = parseMarkdown(markdown).find((block) => block.type === 'title');
  return title && title.type === 'title' ? plainText(title.spans) : BRAND;
}

/**
 * One legal page of flimme.com (M8.3): the text, its date, a link to the same page in the other
 * language and to the other pages. The language is the path's, not the browser's, so a link
 * always shows what it names. Calls no API.
 */
export function LegalPage({ location, markdown, updated }: LegalPageProps) {
  const { language, page } = location;
  const t = i18n.getFixedT(language, 'web');
  const nav = (
    <View
      role="navigation"
      aria-label={t('legal.navLabel')}
      className="flex-row flex-wrap gap-x-5 gap-y-2"
    >
      {legalPageIds.map((id) => (
        <LinkText
          key={id}
          href={legalPath(language, id)}
          variant="body-s"
          aria-current={id === page ? 'page' : undefined}
        >
          {t(`legal.pages.${id}`)}
        </LinkText>
      ))}
    </View>
  );

  return (
    <View className="flex-1 bg-bg-canvas">
      <View className="absolute inset-x-0 top-0 h-80" pointerEvents="none">
        <Spotlight tone="accent" />
      </View>
      <ScrollView contentContainerClassName="grow items-center px-5 py-8">
        <View className="w-full max-w-160 gap-8">
          <View className="flex-row items-center justify-between gap-4">
            <SvgXml
              xml={logos.flimme}
              width={LOGO_WIDTH}
              height={LOGO_HEIGHT}
              accessibilityLabel={BRAND}
              accessibilityRole="image"
            />
            <LinkText
              href={otherLanguagePath(location)}
              variant="body-m-strong"
              label={t('legal.switchLabel')}
              lang={otherLanguage(language)}
            >
              {t('legal.switch')}
            </LinkText>
          </View>
          {nav}
          <View className="gap-2">
            <Text variant="display-l" role="heading" aria-level={1}>
              {legalTitle(markdown)}
            </Text>
            <Text variant="mono-data" tone="muted">
              {t('legal.updated', { date: formatUpdated(updated, language) })}
            </Text>
          </View>
          <MarkdownView markdown={markdown} />
          <View className="gap-4 border-t border-border-default pt-6">
            {nav}
            <Text variant="body-s" tone="muted">
              {t('credits.tmdb')}
            </Text>
            <Text variant="body-s" tone="muted">
              {t('credits.justwatch')}
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
