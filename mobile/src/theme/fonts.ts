// The weights the type styles use, imported one by one so only these files are bundled.
// All three families are under the SIL Open Font License (the licence ships in each package).
import { IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono/500Medium';
import { IBMPlexMono_600SemiBold } from '@expo-google-fonts/ibm-plex-mono/600SemiBold';
import { SchibstedGrotesk_400Regular } from '@expo-google-fonts/schibsted-grotesk/400Regular';
import { SchibstedGrotesk_500Medium } from '@expo-google-fonts/schibsted-grotesk/500Medium';
import { SchibstedGrotesk_600SemiBold } from '@expo-google-fonts/schibsted-grotesk/600SemiBold';
import { Staatliches_400Regular } from '@expo-google-fonts/staatliches/400Regular';

/** Loaded in the root layout; the keys are the fontFamily names the theme uses. */
export const fonts = {
  Staatliches_400Regular,
  SchibstedGrotesk_400Regular,
  SchibstedGrotesk_500Medium,
  SchibstedGrotesk_600SemiBold,
  IBMPlexMono_500Medium,
  IBMPlexMono_600SemiBold,
};

export type FontFamily = keyof typeof fonts;
