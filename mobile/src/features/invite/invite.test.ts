import { appLink, fullLink, isInvitePath, storeLinks, storeOrder } from './invite';

const REF = '0b6b1f0e-1b1c-4a6e-9a43-2f3c1d9e8a77';

describe('appLink', () => {
  it('opens the production scheme with the code and the reference', () => {
    expect(appLink({ code: '482913', ref: REF })).toBe(`flimme://join/482913?r=${REF}`);
  });
  it('leaves the query out without a reference', () => {
    expect(appLink({ code: '482913' })).toBe('flimme://join/482913');
  });
});

describe('fullLink', () => {
  it('rebuilds the link the guest followed', () => {
    expect(fullLink('https://example.test', { code: '482913', ref: REF })).toBe(
      `https://example.test/join/482913?r=${REF}`,
    );
  });
});

describe('isInvitePath', () => {
  it('is true for /join/<something> only', () => {
    expect(isInvitePath('/join/482913')).toBe(true);
    expect(isInvitePath('/join/482913/')).toBe(true);
    expect(isInvitePath('/join/12')).toBe(true);
    expect(isInvitePath('/join')).toBe(false);
    expect(isInvitePath('/')).toBe(false);
    expect(isInvitePath('/home')).toBe(false);
    expect(isInvitePath('/join/1/2')).toBe(false);
  });
});

describe('storeOrder', () => {
  it('puts Google Play first on Android and the App Store first elsewhere', () => {
    expect(storeOrder('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toEqual([
      'googlePlay',
      'appStore',
    ]);
    expect(storeOrder('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')).toEqual([
      'appStore',
      'googlePlay',
    ]);
    expect(storeOrder('')).toEqual(['appStore', 'googlePlay']);
  });
});

describe('storeLinks', () => {
  it('has none while the App Store id is empty', () => {
    expect(storeLinks('')).toBeNull();
  });
  it('points both stores at the app once the id is set', () => {
    expect(storeLinks('123456789')).toEqual({
      appStore: 'https://apps.apple.com/app/id123456789',
      googlePlay: 'https://play.google.com/store/apps/details?id=com.harryviennot.flimme',
    });
  });
});
