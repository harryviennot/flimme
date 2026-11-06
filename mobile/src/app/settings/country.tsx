import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { SettingsSection } from '@/components/screens/settings/settings-section';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { ListRow } from '@/components/ui/list-row';
import { Screen } from '@/components/ui/screen';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { showToast } from '@/components/ui/toast';
import { TopBar } from '@/components/ui/top-bar';
import { countryName, useCatalogCountries, useChooseCountry } from '@/features/country';
import { useMyProfile } from '@/features/profile';
import { errorFeedback } from '@/lib/feedback';

/** The country choice (decisions.md, Q0.4): the countries that have a catalog, one selected. */
export default function CountryScreen() {
  const { t, i18n } = useTranslation('country');
  const profile = useMyProfile();
  const countries = useCatalogCountries();
  const { choose, busy } = useChooseCountry();
  const current = profile.data?.country ?? null;

  const pick = async (code: string) => {
    if (busy || code === current) return;
    const outcome = await choose(code);
    if (outcome === 'failed') {
      errorFeedback();
      showToast({ tone: 'warn', title: t('errors.save') });
      return;
    }
    router.back();
  };

  return (
    <Screen scroll header={<TopBar title={t('title')} onBack={() => router.back()} />}>
      <View className="gap-2 pt-2 pb-8">
        {countries.isError ? (
          <EmptyState
            icon="globe"
            error
            title={t('empty.title')}
            body={t('empty.body')}
            action={{ label: t('empty.action'), onPress: () => void countries.refetch() }}
            autoFocus
          />
        ) : countries.isPending ? (
          <Skeleton className="h-14 w-full rounded-lg" />
        ) : (
          <>
            <SettingsSection>
              {countries.data.map((code) => (
                <ListRow
                  key={code}
                  icon="globe"
                  label={countryName(code, i18n.language)}
                  accessibilityHint={code === current ? t('selected') : undefined}
                  disabled={busy}
                  onPress={() => void pick(code)}
                  trailing={
                    code === current ? (
                      <Icon name="check" size={20} color="accent-text" />
                    ) : (
                      <View className="size-5" />
                    )
                  }
                />
              ))}
            </SettingsSection>
            <Text variant="body-s" tone="muted" className="px-1">
              {t('helper')}
            </Text>
          </>
        )}
      </View>
    </Screen>
  );
}
