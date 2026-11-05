import Constants from 'expo-constants';
import { setStringAsync } from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, ScrollView, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { RoomTicket } from '@/components/shared/room-ticket';
import { Button } from '@/components/ui/button';
import { Spotlight } from '@/components/ui/gradients';
import { Text } from '@/components/ui/text';
import { LinkText } from '@/components/ui/link-text';
import { legalPath } from '@/features/legal/pages';
import { parseInviteLink } from '@/features/join/link';
import { appLink, fullLink } from '@/features/invite/invite';
import { logos } from '@/theme/generated/icons';
import splash from '@/theme/splash.json';

import { StoreBadges } from './store-badges';

const marker = (index: number) => `${index + 1}.`;
const BRAND = 'Flimme';
const LOGO_WIDTH = 200;
const LOGO_HEIGHT = (LOGO_WIDTH * splash.logoViewBox.height) / splash.logoViewBox.width;
/** How long Copy reads "Copied". */
const COPIED_MS = 2000;

export type InvitePageProps = {
  /** The path and query the guest followed, e.g. `/join/482913?r=<uuid>`. */
  link: string;
  /** The page's own origin, for the Copy button. */
  origin?: string;
  userAgent?: string;
};

function appStoreId(): string {
  const extra = Constants.expoConfig?.extra as { appStoreId?: string } | undefined;
  return extra?.appStoreId ?? '';
}

/**
 * What an invite link opens in a browser when the app isn't installed (invite-page.md): the room
 * code in large type, the steps, and the store badges once the stores exist. It calls no API and
 * knows nothing about the room. Anything that isn't a well-formed link shows the broken state.
 */
export function InvitePage({
  link,
  origin = globalThis.location?.origin ?? '',
  userAgent = globalThis.navigator?.userAgent ?? '',
}: InvitePageProps) {
  const { t, i18n } = useTranslation('web');
  const { t: tJoin } = useTranslation('join');
  const [copied, setCopied] = useState(false);
  const invite = parseInviteLink(link);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <View className="flex-1 bg-bg-canvas">
      <View className="absolute inset-x-0 top-0 h-96" pointerEvents="none">
        <Spotlight tone="accent" />
      </View>
      <ScrollView contentContainerClassName="grow items-center px-5 py-10">
        <View className="w-full max-w-96 grow gap-8">
          <View className="items-center">
            <View style={{ width: LOGO_WIDTH, height: LOGO_HEIGHT }}>
              <SvgXml
                xml={logos.flimme}
                width={LOGO_WIDTH}
                height={LOGO_HEIGHT}
                accessibilityLabel={BRAND}
                accessibilityRole="image"
              />
            </View>
          </View>
          <Text
            variant="display-l"
            align="center"
            accessibilityRole="header"
            aria-level={1}
            role="heading"
          >
            {invite ? t('invite.title') : t('invite.broken')}
          </Text>
          {invite ? (
            <>
              <RoomTicket
                code={invite.code}
                leftDetail={tJoin('link.ticketLeft')}
                rightDetail={tJoin('link.ticketRight')}
              />
              <View role="list" accessibilityLabel={t('invite.stepsLabel')} className="gap-3">
                {(
                  [
                    t('invite.steps.get'),
                    t('invite.steps.open'),
                    t('invite.steps.code', {
                      code: `${invite.code.slice(0, 3)} ${invite.code.slice(3)}`,
                    }),
                  ] as const
                ).map((step, index) => (
                  <View key={index} role="listitem" className="flex-row gap-3">
                    <Text variant="body-m-strong" tone="marquee" className="w-5">
                      {marker(index)}
                    </Text>
                    <Text variant="body-m" className="flex-1">
                      {step}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}
          <StoreBadges appStoreId={appStoreId()} userAgent={userAgent} />
          {invite ? (
            <View className="gap-3">
              <Button
                variant="secondary"
                label={copied ? t('invite.copied') : t('invite.copy')}
                onPress={() => {
                  void setStringAsync(fullLink(origin, invite)).then(() => setCopied(true));
                }}
              />
              <Button
                variant="ghost"
                label={t('invite.open')}
                onPress={() => void Linking.openURL(appLink(invite))}
              />
            </View>
          ) : null}
          <View className="gap-2 pt-4">
            <Text variant="body-s" tone="muted" align="center">
              {t('credits.tmdb')}
            </Text>
            <Text variant="body-s" tone="muted" align="center">
              {t('credits.justwatch')}
            </Text>
            <Text variant="body-s" align="center">
              <LinkText
                href={legalPath(i18n.language === 'fr' ? 'fr' : 'en', 'privacy')}
                variant="body-s"
              >
                {t('credits.privacy')}
              </LinkText>
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
