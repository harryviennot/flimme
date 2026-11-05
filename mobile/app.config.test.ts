import type { ConfigContext, ExpoConfig } from 'expo/config';

import appConfig from './app.config';
import eas from './eas.json';

const variants = ['development', 'preview', 'production'] as const;
const originalVariant = process.env.APP_VARIANT;

function load(variant?: string): ExpoConfig {
  if (variant === undefined) delete process.env.APP_VARIANT;
  else process.env.APP_VARIANT = variant;
  return appConfig({ config: {}, projectRoot: '.' } as ConfigContext);
}

afterEach(() => {
  if (originalVariant === undefined) delete process.env.APP_VARIANT;
  else process.env.APP_VARIANT = originalVariant;
});

type Profile = { [key: string]: unknown };
const easJson = eas as { cli: Profile; build: Record<(typeof variants)[number], Profile> };

function pluginOptions(config: ExpoConfig, name: string): unknown {
  const entry = config.plugins?.find((plugin) =>
    Array.isArray(plugin) ? plugin[0] === name : plugin === name,
  );
  return Array.isArray(entry) ? entry[1] : undefined;
}

describe('app config', () => {
  it.each(variants)('%s turns off the iOS disk URL cache', (variant) => {
    expect(load(variant).plugins).toContain('./plugins/with-no-disk-url-cache');
  });

  it('lists French and English for the system per-app language setting', () => {
    expect(pluginOptions(load(), 'expo-localization')).toEqual({ supportedLocales: ['fr', 'en'] });
  });

  it('builds the preview variant with its own ids, scheme, icon and update url', () => {
    const config = load('preview');
    expect(config.ios?.bundleIdentifier).toBe('com.harryviennot.flimme.preview');
    expect(config.android?.package).toBe('com.harryviennot.flimme.preview');
    expect(config.scheme).toBe('flimme-preview');
    expect(config.ios?.icon).toBe('./assets/images/icon-preview.png');
    expect(config.android?.adaptiveIcon?.foregroundImage).toBe(
      './assets/images/android-icon-foreground-preview.png',
    );
    expect(config.updates?.url).toBe('https://u.expo.dev/2aeaa454-cf9d-400f-a840-b8f100e0061e');
  });

  it('gives each variant a different icon so builds cannot be confused', () => {
    const icons = variants.map((variant) => load(variant).ios?.icon);
    expect(new Set(icons).size).toBe(variants.length);
  });

  it('refuses an unknown APP_VARIANT and names the variable', () => {
    expect(() => load('nonsense')).toThrow(/APP_VARIANT/);
  });

  it('is the development variant when APP_VARIANT is not set', () => {
    expect(load().ios?.bundleIdentifier).toBe('com.harryviennot.flimme.dev');
  });

  it.each(variants)('%s uses the fingerprint runtime version and tracks nothing', (variant) => {
    const config = load(variant);
    expect(config.runtimeVersion).toEqual({ policy: 'fingerprint' });
    expect(config.ios?.privacyManifests?.NSPrivacyTracking).toBe(false);
    expect(config.ios?.privacyManifests?.NSPrivacyTrackingDomains).toEqual([]);
  });

  // Universal links and App Links (M4.18): preview and production claim flimme.com/join/*;
  // development builds keep their own scheme (decisions.md, Q14.5).
  it.each(['preview', 'production'])('%s claims flimme.com for universal links', (variant) => {
    expect(load(variant).ios?.associatedDomains).toEqual(['applinks:flimme.com']);
  });

  it.each(['preview', 'production'])(
    '%s has one verified https intent filter for /join/ on flimme.com',
    (variant) => {
      const filters = (load(variant).android?.intentFilters ?? []).filter((filter) =>
        [filter.data ?? []].flat().some((data) => data.scheme === 'https'),
      );
      expect(filters).toEqual([
        {
          action: 'VIEW',
          autoVerify: true,
          data: [{ scheme: 'https', host: 'flimme.com', pathPrefix: '/join/' }],
          category: ['BROWSABLE', 'DEFAULT'],
        },
      ]);
    },
  );

  it('development claims no domain and has no https intent filter', () => {
    const config = load('development');
    expect(config.ios?.associatedDomains).toBeUndefined();
    const https = (config.android?.intentFilters ?? []).filter((filter) =>
      [filter.data ?? []].flat().some((data) => data.scheme === 'https'),
    );
    expect(https).toEqual([]);
  });

  it.each(variants)('%s never asks for the microphone', (variant) => {
    const config = load(variant);
    expect(config.android?.permissions ?? []).not.toContain('android.permission.RECORD_AUDIO');
    expect(pluginOptions(config, 'expo-audio')).toMatchObject({
      recordAudioAndroid: false,
      microphonePermission: false,
    });
  });
});

describe('eas.json', () => {
  it('has one build profile per variant, each with its own channel and environment', () => {
    expect(Object.keys(easJson.build).sort()).toEqual([...variants].sort());
    for (const name of variants) {
      expect(easJson.build[name].channel).toBe(name);
      expect(easJson.build[name].environment).toBe(name);
    }
  });

  it('makes a development client only in development', () => {
    for (const name of variants) {
      expect(easJson.build[name].developmentClient === true).toBe(name === 'development');
    }
  });

  it('keeps the store version in EAS and counts builds up on production only', () => {
    expect(easJson.cli.appVersionSource).toBe('remote');
    expect(easJson.build.production.autoIncrement).toBe(true);
    expect(easJson.build.preview.autoIncrement).toBeUndefined();
  });

  it('keeps preview and development builds internal', () => {
    expect(easJson.build.development.distribution).toBe('internal');
    expect(easJson.build.preview.distribution).toBe('internal');
  });
});
