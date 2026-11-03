import { storeUrl } from './store-url';

const ids = { androidPackage: 'com.harryviennot.flimme', appStoreId: '1234567890' };

describe('storeUrl', () => {
  it('opens the Play Store app on Android, with the website as fallback', () => {
    expect(storeUrl('android', ids)).toEqual({
      primary: 'market://details?id=com.harryviennot.flimme',
      fallback: 'https://play.google.com/store/apps/details?id=com.harryviennot.flimme',
    });
  });

  it('opens the App Store page on iOS', () => {
    expect(storeUrl('ios', ids)).toEqual({ primary: 'https://apps.apple.com/app/id1234567890' });
  });
});
