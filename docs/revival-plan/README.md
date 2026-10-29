# MovieMatch revival plan

A review of [MovieMatch](https://github.com/harryviennot/MovieMatch) and [MovieMatchServer](https://github.com/harryviennot/MovieMatchServer), with a plan to get MovieMatch to a public release. Written in October 2026.

> Copied from `harryviennot/MovieMatch`, branch `docs/revival-plan` (commit 4da98a1). The data model built from it is in [../data-model](../data-model/README.md).

- **Report (live):** https://claude.ai/artifact/BtN7AF4dE9zfBTvZpxWckg (private until shared from its Share menu)
- **Report (offline copy):** [index.html](index.html). Download it and open it in a browser; GitHub only shows the source.
- **Design file:** https://www.figma.com/design/v2ZGLbGmzZ7032V9AI5vWM
  - **Release screens:** 25 phone screens plus a share card, grouped into 6 flows. Section 07 compares the new movie card with an exact copy of the card from the [original MovieMatch Figma](https://www.figma.com/file/FemeYv6ANlWLGDvwfXAs7s).
  - **Design tokens:** variables, text and effect styles, icons and components, including both movie cards with a tap-to-flip back side.

## What the report covers

- An audit of both repos, with file and line references: why decks were slow, why suggestions were weak, plus the race conditions and other bugs found.
- Letterboxd feasibility. The official API is closed to this kind of app. The public RSS feed and each user's own data export cover what the game needs.
- Stack recommendation: Expo SDK 58 and Supabase, TypeScript end to end.
- A catalog-based backend that takes external API calls out of the game.
- A group-aware recommendation engine that learns from every swipe.
- Game design ideas, an Expo 51 to 58 upgrade table, a publishing checklist and a roadmap.

## Decisions so far

- Movies only at launch. Series can come later as a mode.
- Accent colors: the red and yellow are as saturated as the brand blue. Yellow is back to the original app's #F6C700.
- Tapping a card flips it in place to show the synopsis and ratings.
- Ratings: the TMDB score, plus a group member's Letterboxd rating when someone has rated the film. No IMDb or Rotten Tomatoes, so no extra ratings API.
