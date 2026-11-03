import type { ConfigContext, ExpoConfig } from 'expo/config';

import fontList from './src/theme/fonts.json';

type Variant = 'development' | 'preview' | 'production';

// The app is called Flimme (decided on 29 October 2026). The bundle id can't change
// once the store records exist (roadmap M10.1).
const BUNDLE_ID = 'com.harryviennot.flimme';
const DISPLAY_NAME = 'Flimme';

// Development and preview wear a badge so the builds can't be confused with each other or with the
// store app. They are placeholders until the designer exports the real ones (roadmap M11.2).
const variants = {
  development: {
    idSuffix: '.dev',
    name: `${DISPLAY_NAME} Dev`,
    scheme: 'flimme-dev',
    iosIcon: './assets/images/icon-dev.png',
    androidForeground: './assets/images/android-icon-foreground-dev.png',
  },
  preview: {
    idSuffix: '.preview',
    name: `${DISPLAY_NAME} Preview`,
    scheme: 'flimme-preview',
    iosIcon: './assets/images/icon-preview.png',
    androidForeground: './assets/images/android-icon-foreground-preview.png',
  },
  production: {
    idSuffix: '',
    name: DISPLAY_NAME,
    scheme: 'flimme',
    iosIcon: './assets/expo.icon',
    androidForeground: './assets/images/android-icon-foreground.png',
  },
} as const;

// `eas build` and `eas update` must both see the same APP_VARIANT (an EAS environment variable),
// because the app config counts in the fingerprint.
function readVariant(): Variant {
  const value = process.env.APP_VARIANT ?? 'development';
  if (!Object.hasOwn(variants, value)) {
    throw new Error(
      `APP_VARIANT is "${value}", expected one of: ${Object.keys(variants).join(', ')}.`,
    );
  }
  return value as Variant;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const variant = readVariant();
  const current = variants[variant];

  return {
    ...config,
    name: current.name,
    slug: 'flimme',
    owner: 'hryvnt',
    version: '0.1.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: current.scheme,
    // The design is dark only.
    userInterfaceStyle: 'dark',
    backgroundColor: '#0f1014',
    runtimeVersion: { policy: 'fingerprint' },
    updates: { url: 'https://u.expo.dev/2aeaa454-cf9d-400f-a840-b8f100e0061e' },
    ios: {
      bundleIdentifier: BUNDLE_ID + current.idSuffix,
      icon: current.iosIcon,
      // The privacy manifest (groundwork.md#easy-to-forget). The app tracks nothing; Expo's
      // modules add their own required-reason entries.
      privacyManifests: {
        NSPrivacyTracking: false,
        NSPrivacyTrackingDomains: [],
      },
      // Tablets get the phone layout until tablets are decided (decisions.md).
      supportsTablet: false,
    },
    android: {
      package: BUNDLE_ID + current.idSuffix,
      adaptiveIcon: {
        backgroundColor: '#0f1014',
        foregroundImage: current.androidForeground,
        backgroundImage: './assets/images/android-icon-background.png',
        monochromeImage: './assets/images/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
      // expo-secure-store's biometric library declares these; the app never uses biometrics.
      blockedPermissions: [
        'android.permission.USE_BIOMETRIC',
        'android.permission.USE_FINGERPRINT',
      ],
    },
    web: {
      // At launch the web build only serves the invite page (app-structure.md).
      output: 'single',
      favicon: './assets/images/favicon.png',
    },
    plugins: [
      'expo-router',
      [
        'expo-splash-screen',
        {
          backgroundColor: '#0f1014',
          // The Flimme logo, made by scripts/make-logo.swift (splash.md#the-logo). iOS shows it at
          // the Figma's size; Android 12 and later keep only a 192 dp circle of the icon, so it's
          // smaller there. The hand-off view draws it at the same size on each platform.
          image: './assets/images/splash-icon.png',
          imageWidth: 354,
          android: { imageWidth: 200 },
        },
      ],
      // Sounds only play; the app never records, on either platform.
      ['expo-audio', { microphonePermission: false, recordAudioAndroid: false }],
      // Lists Flimme in the system's per-app language setting (iOS, and Android 13 and later). On
      // Android it also keeps only these languages' resources in native libraries, so system text
      // inside the app matches the app: English on a device in any other language.
      ['expo-localization', { supportedLocales: ['fr', 'en'] }],
      // Fonts are embedded at build time, so the first frame already has them (no system-font
      // flash) and nothing loads at runtime. iOS names a font by the PostScript name inside the
      // file; Android by the file name, so each Android entry sets that same PostScript name as
      // its family. The list is src/theme/fonts.json.
      [
        'expo-font',
        {
          ios: { fonts: fontList.fonts.map((f) => `./${f.file}`) },
          android: {
            fonts: fontList.fonts.map((f) => ({
              fontFamily: f.postScriptName,
              fontDefinitions: [{ path: `./${f.file}`, weight: f.weight }],
            })),
          },
        },
      ],
      'expo-sqlite',
      // Keeps the session key out of Android Auto Backup (security.md#the-app). The app never asks
      // for biometrics, so no Face ID text (see the blocked Android permissions too).
      ['expo-secure-store', { configureAndroidBackup: true, faceIDPermission: false }],
      // iOS would keep Auth responses (with the session in plain text) in its disk URL cache.
      './plugins/with-no-disk-url-cache',
      // Crash reports (app-structure.md#analytics-and-crash-reports), EU region. The token comes
      // from SENTRY_AUTH_TOKEN in the EAS environment, never from this file. Debug builds upload
      // nothing (Metro resolves their frames).
      [
        '@sentry/react-native/expo',
        { organization: 'flimme', project: 'flimme-app', url: 'https://de.sentry.io/' },
      ],
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      variant,
      // The App Store id of the app, for the update screen's link. Empty until the app exists
      // in the store (roadmap M10.1).
      appStoreId: '',
      eas: { projectId: '2aeaa454-cf9d-400f-a840-b8f100e0061e' },
    },
  };
};
