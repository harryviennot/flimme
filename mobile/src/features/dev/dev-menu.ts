// Adds "Flimme dev menu" to the Expo dev menu (shake, or `m` in the Metro terminal), so the
// app's own dev screen (`/dev`) is one tap away. Development builds only: the dev client is
// only loaded when this runs with `dev` on, so a preview or production build never does.

/** `dev` is `__DEV__`; tests pass it. Never throws: a missing dev menu is not an error. */
export async function registerDevMenu(open: () => void, dev: boolean = __DEV__): Promise<void> {
  if (!dev) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { registerDevMenuItems } = require('expo-dev-client') as typeof import('expo-dev-client');
    await registerDevMenuItems([{ name: 'Flimme dev menu', callback: open, shouldCollapse: true }]);
  } catch {
    // Expo Go, web, or a build without the dev client: nothing to add the item to.
  }
}
