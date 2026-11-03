import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { Linking, Platform } from 'react-native';

import { storeUrl } from './store-url';

/** Opens this app's store page: the Play Store app (or its website) or the App Store. */
export async function openStore(): Promise<void> {
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const extra = Constants.expoConfig?.extra as { appStoreId?: string } | undefined;
  const { primary, fallback } = storeUrl(platform, {
    androidPackage: Application.applicationId ?? '',
    appStoreId: extra?.appStoreId ?? '',
  });
  try {
    await Linking.openURL(primary);
  } catch (error) {
    if (!fallback) throw error;
    await Linking.openURL(fallback);
  }
}
