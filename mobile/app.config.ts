import type { ConfigContext, ExpoConfig } from 'expo/config';

type Variant = 'development' | 'preview' | 'production';

const variant = (process.env.APP_VARIANT ?? 'development') as Variant;

// Players never see the bundle id, and it can't change once the store records
// exist (roadmap M10.1). It doesn't wait for the app's name (M0.1).
const BUNDLE_ID = 'com.harryviennot.moviematch';
// Until the name is chosen (M0.1).
const DISPLAY_NAME = 'MovieMatch';

const variants = {
  development: { idSuffix: '.dev', name: `${DISPLAY_NAME} Dev`, scheme: 'moviematch-dev' },
  preview: { idSuffix: '.preview', name: `${DISPLAY_NAME} Preview`, scheme: 'moviematch-preview' },
  production: { idSuffix: '', name: DISPLAY_NAME, scheme: 'moviematch' },
} as const;

const current = variants[variant];

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: current.name,
  slug: 'movie-swipe',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: current.scheme,
  // The design is dark only.
  userInterfaceStyle: 'dark',
  backgroundColor: '#0f1014',
  runtimeVersion: { policy: 'fingerprint' },
  ios: {
    bundleIdentifier: BUNDLE_ID + current.idSuffix,
    icon: './assets/expo.icon',
    // Tablets get the phone layout until tablets are decided (decisions.md).
    supportsTablet: false,
  },
  android: {
    package: BUNDLE_ID + current.idSuffix,
    adaptiveIcon: {
      backgroundColor: '#0f1014',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
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
        image: './assets/images/splash-icon.png',
        imageWidth: 76,
      },
    ],
    // Sounds only play; the app never records.
    ['expo-audio', { microphonePermission: false }],
    'expo-localization',
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: { variant },
});
