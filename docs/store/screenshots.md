# Store screenshots

The six screenshots for App Store Connect and Google Play Console, in French and English, and how to make them again. Read it before uploading the images (the console walkthrough comes with M11.9) or when a screen changes (M11.10 re-runs the rig). The listing text is in [listing.md](listing.md); the order and the rules are in [store listing](../product/store-listing.md#screenshots-and-the-preview-video).

## What is required (checked 6 November 2026)

Source: [App Store Connect screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/).

| Store | Rule | What we ship |
| --- | --- | --- |
| App Store | At least 1, up to 10 per device size. PNG or JPEG, no alpha. The size that is required is iPhone with Dynamic Island (medium display): 1179 × 2556 or 1206 × 2622 portrait. The large size (6.9 inch, 1320 × 2868) is optional and is scaled from the medium one when missing | 6 PNGs at 1206 × 2622 per language, no alpha. iPad is not needed (`supportsTablet: false`) |
| Google Play | 2 to 8 phone screenshots, 320 to 3840 px, long side at most twice the short side. At least 4 at 1080 × 1920 or more to be recommended | 6 PNGs at 1080 × 1920 per language, made from the iOS captures with the status bar and the home indicator cropped |

## The captions

One line each, in the app's display font above the screen. French uses "tu" for one person and "vous" for the room. `mobile/scripts/frame-screenshots.swift` and `mobile/src/features/dev/store-fixtures.test.ts` read this table: keep one row per scene, in this order.

| # | Scene | Français | English |
| --- | --- | --- | --- |
| 01 | swipe | Chacun swipe. | Everyone swipes. |
| 02 | match | Le film que tout le monde veut, en quelques minutes. | A film you all want, in minutes. |
| 03 | lobby | Rejoins avec un code ou un lien. | Join with a code or a link. |
| 04 | card-back | Seulement ce que vous pouvez regarder ce soir. | Only what you can watch tonight. |
| 05 | final-cut | Pas de match ? Le Final Cut tranche. | No match? The Final Cut decides. |
| 06 | recap | Partage ta soirée. | Share your movie night. |

## What is in the images

- **Fictional art only.** The posters are the design's own, in `mobile/assets/posters/`, never TMDB art. The films, players (Léa, Sam, Jo, Maya) and services ("Service A", "Service B", as text) are made up. No service logo, no TMDB or JustWatch logo (the text credit "Disponibilités fournies par JustWatch." on the card back is the app's own line).
- **The lobby shows the code 123456.** It is a fixture; rooms expire, so no live room is exposed. The lobby shows the code and the "Partager le lien" and "Voir le QR code" buttons (the QR itself lives on the invite sheet, which is not one of the six).
- **No dev UI.** The dev menu's button is switched off through the launch URL (`__expo_disable_fab=1`), and the status bar reads 9:41 with full battery and signal.
- **Content suits 4+.** Nothing in the six scenes is violent, scary or adult.

## Where the files are

`docs/store/screenshots/app-store/{fr,en}/NN-<scene>.png` (1206 × 2622) and `docs/store/screenshots/google-play/{fr,en}/NN-<scene>.png` (1080 × 1920). Harry uploads the App Store set in App Store Connect (the version page, iPhone 6.3" or 6.9" display slot, per localisation) and the Google Play set in Main store listing, Phone screenshots, after the first Android build.

## How to make them again

The scenes are dev-only routes (`/dev/store/<scene>?lang=fr|en`, `mobile/src/app/dev/store/[scene].tsx`) that draw the real components over fixtures in `mobile/src/features/dev/store-fixtures.ts`. They need no backend and cannot be reached in a production build (the route sends you home).

1. Install the development build on an iPhone 17 simulator (1206 × 2622), region set to France.
2. From `mobile/`, start Metro with placeholder Supabase values (the app throws without them): `EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=placeholder EXPO_PUBLIC_SERVER_URL=http://127.0.0.1:8000 npx expo start --dev-client --port 8096`.
3. `scripts/store-shots.sh <simulator udid> 8096` sets the status bar, opens each scene in both languages, captures it and frames it with `scripts/frame-screenshots.swift` (the caption above the screen, the Play crop).
4. Look at every image before committing.

`mobile/.maestro/store-shots.yaml` opens the same scenes from Maestro, for a run that needs a flow (the video, M11.4).
