// The invite page's logic (docs/design/screens/invite-page.md): no JSX, no API.

export type Invite = { code: string; ref?: string };
export type Store = 'appStore' | 'googlePlay';

/** The production app's scheme: the page can't know which build a guest has. */
const SCHEME = 'flimme';
const PLAY_PACKAGE = 'com.harryviennot.flimme';

/** Opens the app on the join screen, with the reference when the link had one. */
export function appLink({ code, ref }: Invite): string {
  return `${SCHEME}://join/${code}${ref ? `?r=${ref}` : ''}`;
}

/** The invite link as the guest received it, for the Copy button. */
export function fullLink(origin: string, { code, ref }: Invite): string {
  return `${origin}/join/${code}${ref ? `?r=${ref}` : ''}`;
}

/** `/join/<anything>`: the paths the invite route handles. Every other path is a broken link. */
export function isInvitePath(pathname: string): boolean {
  return /^\/join\/[^/]+\/?$/.test(pathname);
}

/** The device's own store first (invite-page.md, layout 5). */
export function storeOrder(userAgent: string): [Store, Store] {
  return /android/i.test(userAgent) ? ['googlePlay', 'appStore'] : ['appStore', 'googlePlay'];
}

/** Store pages, or null while the App Store id is empty (before roadmap M10.1). */
export function storeLinks(appStoreId: string): Record<Store, string> | null {
  if (!appStoreId) return null;
  return {
    appStore: `https://apps.apple.com/app/id${appStoreId}`,
    googlePlay: `https://play.google.com/store/apps/details?id=${PLAY_PACKAGE}`,
  };
}
