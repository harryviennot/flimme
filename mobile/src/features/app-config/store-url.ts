export type StorePlatform = 'ios' | 'android';

export type StoreIds = {
  /** The Android package, from the app config. */
  androidPackage: string;
  /** The App Store id; empty until the app exists in the store (roadmap M10.1). */
  appStoreId: string;
};

/**
 * Where the update button goes. Android prefers the Play Store app (`market://`) and falls back
 * to the website; iOS opens the App Store page.
 */
export function storeUrl(
  platform: StorePlatform,
  ids: StoreIds,
): { primary: string; fallback?: string } {
  if (platform === 'android') {
    return {
      primary: `market://details?id=${ids.androidPackage}`,
      fallback: `https://play.google.com/store/apps/details?id=${ids.androidPackage}`,
    };
  }
  return { primary: `https://apps.apple.com/app/id${ids.appStoreId}` };
}
