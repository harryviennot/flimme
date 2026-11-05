import type { AnalyticsChoice } from '@flimme/contract';

// Which rules apply to a player's analytics (analytics.md#analytics-consent, decisions.md #194).
// Strict regions: the EEA (the EU 27, Iceland, Liechtenstein, Norway), the UK and Switzerland.
// The French overseas regions are part of the EU and count too, which is the stricter reading.
const STRICT_REGIONS: ReadonlySet<string> = new Set([
  ...['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE'],
  ...['IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'],
  ...['IS', 'LI', 'NO', 'GB', 'CH', 'GP', 'MQ', 'GF', 'RE', 'YT'],
]);

/** A missing or unknown code is strict: when in doubt, the stricter rule applies. */
export function isStrictRegion(code: string | null | undefined): boolean {
  const normal = code?.trim().toUpperCase();
  if (!normal || !/^[A-Z]{2}$/.test(normal)) return true;
  return STRICT_REGIONS.has(normal);
}

export type AnalyticsMode = 'off' | 'anonymous' | 'identified';

export type RegionInputs = {
  /** The device region (`getLocales()[0].regionCode`). */
  deviceRegion: string | null;
  /** `profiles.country`. */
  profileCountry: string | null;
};

/** Strict when either the device or the profile says so, or when one of them is missing. */
export function isStrictFor({ deviceRegion, profileCountry }: RegionInputs): boolean {
  return isStrictRegion(deviceRegion) || isStrictRegion(profileCountry);
}

/**
 * What runs for a choice (analytics.md#analytics-consent). `off` sends nothing; `on` is the
 * region's mode; `detailed` is identified, but only where it is offered (strict regions): elsewhere
 * it reads as `on`, which is identified anyway.
 */
export function resolveMode(choice: AnalyticsChoice, strict: boolean): AnalyticsMode {
  if (choice === 'off') return 'off';
  if (choice === 'detailed') return 'identified';
  return strict ? 'anonymous' : 'identified';
}
