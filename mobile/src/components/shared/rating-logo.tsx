import { Image } from 'expo-image';
import { SvgXml } from 'react-native-svg';

import { logos } from '@/theme/generated/icons';

export type RatingLogoProps = {
  source: 'tmdb' | 'letterboxd';
  /** Height in points; the width follows the mark's proportions. */
  height?: number;
};

// TMDB and Letterboxd are the only ratings the app shows (decisions.md). TMDB's logo must
// follow its attribution rules (tmdb.md#terms-licence-and-attribution); check the file
// against TMDB's current logo before the store release.
const tmdbLogo = require('@/assets/logos/tmdb.png');

/** The mark next to a rating: TMDB's logo, or Letterboxd's three dots. */
export function RatingLogo({ source, height = 12 }: RatingLogoProps) {
  if (source === 'letterboxd') {
    return (
      <SvgXml
        xml={logos.letterboxd}
        height={height}
        width={(height * 28) / 12}
        accessibilityLabel="Letterboxd"
      />
    );
  }
  return (
    <Image
      source={tmdbLogo}
      contentFit="contain"
      style={{ height: height * 2, width: height * 4 }}
      accessibilityLabel="TMDB"
    />
  );
}
