# mobile/

The Expo SDK 58 app. Load the `expo-app` skill before changing anything here, `design-system` for anything visible and `motion` for anything that moves.

**Expo changes every SDK: don't trust memory.** Check the SDK 58 docs (`https://docs.expo.dev/versions/v58.0.0/`, index at `https://docs.expo.dev/llms.txt`) before using an Expo, EAS or React Native API. Add packages with `npx expo install <pkg>` from this folder. Development builds only (`npx expo run:ios`, `run:android`); never create or edit `ios/` or `android/` by hand.

- Routes live in `src/app/` and stay thin. Components in `src/components/ui/` (primitives), `shared/` (reused pieces), `screens/<screen>/` (single use). Logic in `src/features/`.
- Styles are Uniwind (Tailwind 4) classes from the theme only. The theme is generated from `src/theme/tokens.json` by `pnpm tokens`; never edit `src/theme/generated/`.
- Every component in `ui/` and `shared/` has a `<name>.gallery.tsx` next to it, listed in `src/components/gallery-registry.ts`; the gallery is at `/dev/gallery` in development builds.
- Strings through `t()`, in `src/i18n/locales/fr` and `en`.
- `pnpm check` runs everything CI runs for the app: tokens, translations, gallery entries, ESLint, TypeScript, Jest.
