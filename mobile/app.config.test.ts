import type { ConfigContext, ExpoConfig } from 'expo/config';

import appConfig from './app.config';

function load(): ExpoConfig {
  return appConfig({ config: {}, projectRoot: '.' } as ConfigContext);
}

function pluginOptions(config: ExpoConfig, name: string): unknown {
  const entry = config.plugins?.find((plugin) =>
    Array.isArray(plugin) ? plugin[0] === name : plugin === name,
  );
  return Array.isArray(entry) ? entry[1] : undefined;
}

describe('app config', () => {
  it('lists French and English for the system per-app language setting', () => {
    expect(pluginOptions(load(), 'expo-localization')).toEqual({ supportedLocales: ['fr', 'en'] });
  });
});
