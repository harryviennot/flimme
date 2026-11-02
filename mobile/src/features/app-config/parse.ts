import type { AppConfig } from '@flimme/contract';

import { isVersion } from './version';

/** A value the app can't read: reported, then treated as missing. */
export type Report = (problem: string) => void;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The `app_config` keys the app reads, from the object the API wrapper returns. Unknown keys
 * are ignored; a key that is missing or malformed is left out, and a malformed one is reported
 * (never thrown: a bad value in the table must not lock players out).
 */
export function parseAppConfig(raw: unknown, report: Report = () => {}): AppConfig {
  const config: AppConfig = {};
  if (!isRecord(raw)) return config;

  const minimum = raw.min_app_version;
  if (minimum !== undefined) {
    if (isRecord(minimum) && isVersion(minimum.ios) && isVersion(minimum.android)) {
      config.min_app_version = { ios: minimum.ios, android: minimum.android };
    } else {
      report('app_config.min_app_version is malformed');
    }
  }

  const imageBase = raw.tmdb_image_base;
  if (imageBase !== undefined) {
    if (typeof imageBase === 'string') config.tmdb_image_base = imageBase;
    else report('app_config.tmdb_image_base is malformed');
  }

  return config;
}
