import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AboutCard } from '@/components/screens/settings/about-card';
import { SettingsSection } from '@/components/screens/settings/settings-section';
import { Banner } from '@/components/ui/banner';
import { ListRow } from '@/components/ui/list-row';
import { Screen } from '@/components/ui/screen';
import { Skeleton } from '@/components/ui/skeleton';
import { Toggle } from '@/components/ui/toggle';
import { TopBar } from '@/components/ui/top-bar';
import { useAnalyticsStrict } from '@/features/analytics';
import { useExportData } from '@/features/account/use-export-data';
import { useSettingsLinks } from '@/features/account/use-settings-links';
import { countryName } from '@/features/country';
import { useOnline } from '@/features/network';
import { useMyProfile } from '@/features/profile';
import {
  chooseAnalytics,
  useAnalyticsChoice,
  useHapticsEnabled,
  useSettingsStore,
  useSoundEnabled,
} from '@/features/settings';
import { haptics } from '@/lib/haptics';

function LoadingRow() {
  return (
    <View className="h-14 justify-center border-b border-border-subtle px-4">
      <Skeleton className="h-4 w-32 rounded-sm" />
    </View>
  );
}

/** Settings (docs/design/screens/settings.md): everything a player may want once, in one list. */
export default function SettingsScreen() {
  const { t, i18n } = useTranslation('settings');
  const { t: tc } = useTranslation('country');
  const country = useMyProfile().data?.country ?? null;
  const online = useOnline();
  const hapticsOn = useHapticsEnabled();
  const soundOn = useSoundEnabled();
  const analytics = useAnalyticsChoice();
  const strictRegion = useAnalyticsStrict();
  const exporting = useExportData();
  const links = useSettingsLinks();

  const setHaptics = (value: boolean) => {
    useSettingsStore.getState().setHapticsEnabled(value);
    // Turning haptics back on gives one press, so the player feels it is back.
    if (value) haptics.press();
  };

  const helpRowShown = links.status === 'loading' || links.supportEmail !== null;

  return (
    <Screen scroll header={<TopBar title={t('title')} onBack={() => router.back()} />}>
      <View className="gap-6 pt-2 pb-8">
        {online ? null : <Banner tone="warn" message={t('offline')} />}

        <SettingsSection label={t('sections.preferences')} helper={t('preferences.helper')}>
          <ListRow
            icon="globe"
            label={t('language.label')}
            value={t('language.current')}
            accessibilityHint={t('a11y.languageHint')}
            onPress={links.openLanguage}
          />
          <ListRow
            icon="film"
            label={tc('row')}
            value={country ? countryName(country, i18n.language) : undefined}
            onPress={() => router.push('/settings/country')}
          />
          <ListRow
            icon="zap"
            label={t('haptics.label')}
            trailing={
              <Toggle
                value={hapticsOn}
                onValueChange={setHaptics}
                accessibilityLabel={t('haptics.label')}
              />
            }
          />
          <ListRow
            icon="volume"
            label={t('sound.label')}
            trailing={
              <Toggle
                value={soundOn}
                onValueChange={(value) => useSettingsStore.getState().setSoundEnabled(value)}
                accessibilityLabel={t('sound.label')}
              />
            }
          />
        </SettingsSection>

        <View className="gap-2">
          <SettingsSection
            label={t('sections.privacy')}
            helper={
              strictRegion
                ? `${t('analytics.helper')} ${t('analytics.helperStrict')}`
                : t('analytics.helper')
            }
          >
            <ListRow
              icon="eye"
              label={t('analytics.label')}
              trailing={
                <Toggle
                  value={analytics !== 'off'}
                  onValueChange={(value) => chooseAnalytics(value ? 'on' : 'off')}
                  accessibilityLabel={t('analytics.label')}
                />
              }
            />
            {strictRegion ? (
              <ListRow
                icon="user"
                label={t('analytics.detailed')}
                trailing={
                  <Toggle
                    value={analytics === 'detailed'}
                    disabled={analytics === 'off'}
                    onValueChange={(value) => chooseAnalytics(value ? 'detailed' : 'on')}
                    accessibilityLabel={t('analytics.detailed')}
                  />
                }
              />
            ) : null}
          </SettingsSection>
          <SettingsSection>
            <ListRow
              icon="upload"
              label={exporting.busy ? t('export.preparing') : t('export.label')}
              loading={exporting.busy}
              onPress={exporting.start}
            />
            {links.status === 'loading' ? (
              <>
                <LoadingRow />
                <LoadingRow />
              </>
            ) : (
              <>
                {links.privacy ? (
                  <ListRow
                    icon="shield"
                    label={t('legal.privacy')}
                    accessibilityHint={t('a11y.opensBrowser')}
                    onPress={links.openPrivacy}
                  />
                ) : null}
                {links.terms ? (
                  <ListRow
                    icon="info"
                    label={t('legal.terms')}
                    accessibilityHint={t('a11y.opensBrowser')}
                    onPress={links.openTerms}
                  />
                ) : null}
              </>
            )}
          </SettingsSection>
        </View>

        {helpRowShown ? (
          <SettingsSection label={t('sections.help')}>
            {links.status === 'loading' ? (
              <LoadingRow />
            ) : (
              <ListRow
                icon="mail"
                label={t('support.label')}
                accessibilityHint={t('a11y.opensMail')}
                onPress={links.contactSupport}
              />
            )}
          </SettingsSection>
        ) : null}

        <SettingsSection label={t('sections.about')}>
          <AboutCard />
        </SettingsSection>

        <SettingsSection>
          <ListRow
            icon="trash"
            tone="danger"
            label={t('delete.label')}
            accessibilityHint={t('a11y.deleteHint')}
            onPress={() => router.push('/settings/delete')}
          />
        </SettingsSection>
      </View>
    </Screen>
  );
}
