// The same fonts as fonts.json, for the web export: the expo-font config plugin embeds them in
// the native builds only, so the web root layout loads them with `useFonts`. Keyed by the
// PostScript names the theme uses (a test checks the two lists match).
export const webFonts = {
  'Staatliches-Regular': require('../../assets/fonts/Staatliches-Regular.ttf'),
  'SchibstedGrotesk-Regular': require('../../assets/fonts/SchibstedGrotesk-Regular.ttf'),
  'SchibstedGrotesk-Medium': require('../../assets/fonts/SchibstedGrotesk-Medium.ttf'),
  'SchibstedGrotesk-SemiBold': require('../../assets/fonts/SchibstedGrotesk-SemiBold.ttf'),
  'IBMPlexMono-Medium': require('../../assets/fonts/IBMPlexMono-Medium.ttf'),
  'IBMPlexMono-SemiBold': require('../../assets/fonts/IBMPlexMono-SemiBold.ttf'),
};
