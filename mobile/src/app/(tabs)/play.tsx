import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { HomeHeader } from '@/components/screens/home/header';
import { HostCard } from '@/components/screens/home/host-card';
import { JoinCard } from '@/components/screens/home/join-card';
import { Banner } from '@/components/ui/banner';
import { Screen } from '@/components/ui/screen';
import { greetingFor } from '@/features/home/greeting';
import { useOnline } from '@/features/network';
import { useMyProfile } from '@/features/profile';

export default function HomeScreen() {
  const { t } = useTranslation('home');
  const online = useOnline();
  const { data } = useMyProfile();
  const profile = data ? { displayName: data.display_name, avatarKey: data.avatar_key } : null;

  return (
    <Screen scroll insetBottom={false}>
      <View className="gap-5 pt-2 pb-4">
        <HomeHeader greeting={greetingFor(new Date())} profile={profile} />
        {online ? null : <Banner tone="warn" message={t('offline')} />}
        <HostCard />
        <JoinCard />
      </View>
    </Screen>
  );
}
