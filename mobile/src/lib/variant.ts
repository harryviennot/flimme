import Constants from 'expo-constants';

export type Variant = 'development' | 'preview' | 'production';

/** Which build this is, from the app config's APP_VARIANT (app.config.ts). */
export function variant(): Variant {
  const value = Constants.expoConfig?.extra?.variant;
  return value === 'preview' || value === 'production' ? value : 'development';
}
