# Decisions

Everything decided so far, the defaults chosen while designing that still need a yes, and the questions still open. Each line links to the doc with the details. When something is decided or opened, add it here.

## Decided

| Decision | Since | Details |
| --- | --- | --- |
| Movies only at launch; series can come later as a mode | Before 28 Oct 2026 | [Revival plan](product/revival-plan.md#decisions-for-you) |
| Accent colors: the red and yellow are as saturated as the brand blue; yellow is back to the original app's #F6C700 | Before 28 Oct 2026 | [Figma](https://www.figma.com/design/v2ZGLbGmzZ7032V9AI5vWM) |
| Tapping a card flips it in place to show the synopsis and ratings | Before 28 Oct 2026 | [Figma](https://www.figma.com/design/v2ZGLbGmzZ7032V9AI5vWM) |
| Ratings on cards: the TMDB score, plus a seated player's Letterboxd rating when they have rated the film. No IMDb or Rotten Tomatoes, so no extra ratings API | Before 28 Oct 2026 | [Revival plan](product/revival-plan.md#the-catalog) |
| Supabase runs the game and realtime; a recommendation server around it ranks decks, learns and makes every outside call. Postgres decides the game, the server decides the deck | 29 Oct 2026 | [Recommendation server](architecture/recommendation-server.md), [Who does what](architecture/data-model.md#who-does-what) |
| The app reaches the backend only through the `api` schema; incompatible changes ship as `_v2` | 29 Oct 2026 | [The app's API](architecture/data-model.md#the-apps-api) |
| The recommendation algorithm learns from swipes, Letterboxd ratings and global ratings | 29 Oct 2026 | [The algorithm](architecture/recommendation-server.md#the-algorithm-stage-by-stage) |
| Letterboxd connects only by uploading the player's own export; the username comes from its `profile.csv`; each app account keeps its own copy | 29 Oct 2026 | [Letterboxd](integrations/letterboxd.md#connecting) |
| Letterboxd ratings come only from diary entries; rated films without a diary entry are ignored | 29 Oct 2026 | [The export file](integrations/letterboxd.md#the-export-file) |
| The Letterboxd watchlist is kept | 29 Oct 2026 | [The export file](integrations/letterboxd.md#the-export-file) |
| Letterboxd syncs: the export at connect, the RSS feed when a player joins a room and their last sync is over 6 hours old, and every 14 days for accounts not synced in that time | 29 Oct 2026 | [Keeping it fresh](integrations/letterboxd.md#keeping-it-fresh) |

## Defaults, not yet confirmed

Chosen while designing; each is easy to change.

| Default | Why | Details |
| --- | --- | --- |
| `watched.csv` is read as a "seen" flag, nothing more | Without it, films watched but never logged (nearly half in the export checked) would show up in decks | [The export file](integrations/letterboxd.md#the-export-file) |
| Hearts are not read, from the export or the feed | The diary has none, so hearts from the feed alone would be an uneven signal | [The export file](integrations/letterboxd.md#the-export-file) |
| Connecting opens Letterboxd's export page in a browser sheet, then the file picker | The password never touches the app; an embedded browser can't receive the download on Android | [Connecting](integrations/letterboxd.md#connecting) |
| An upload is refused if under 80% of the public feed's pre-export entries are in it | Stops hand-made exports without refusing players who edited entries since | [The RSS check](integrations/letterboxd.md#the-rss-check) |
| Scheduled Letterboxd syncs stop after 12 months without playing | No point syncing people who left | [Keeping it fresh](integrations/letterboxd.md#keeping-it-fresh) |
| Rooms hold up to 10 players at launch | The match rules go up to 10. Free 6 and Pro 20 come with Pro | [Data model](architecture/data-model.md#the-room) |
| Players can join while swiping, not while the deck is being dealt or during the finale | A late joiner gets the shared opening and a refill | [Create and join](architecture/data-model.md#create-and-join) |
| Starting values to tune: 2 super likes and 1 veto per game; a seat counts as present for 90 seconds after its last heartbeat; a refill at 15 cards left; the SQL fallback after 8 seconds of server silence; 10-minute finale limits for 5 or more players and for Final Cut; a baseline misery line of 1.0 on the percentile scale | Placeholders until playtests | [Data model](architecture/data-model.md#configuration) |

## Open

| Question | Notes | Details |
| --- | --- | --- |
| The app's name | `app.json` says FilmFlicker, the repo says MovieMatch, and the stores already list MatchMovie and similar names | [Revival plan](product/revival-plan.md#decisions-for-you) |
| Money: whether and when to charge | Any revenue needs a TMDB commercial license. The monetization doc recommends launching free, then Host Pro with the family modes | [Monetization](product/monetization.md) |
| The recommendation server's language | Python recommended: the ranking and training libraries are there, and the contract with the database is SQL and JSON. TypeScript with training in Python is the alternative | [Recommendation server](architecture/recommendation-server.md) |
| Letterboxd ratings as features in a model trained across players | Fine for a player's own recommendations; the shared model is the grey area. Needs a short legal read before launch | [Using the data](integrations/letterboxd.md#using-the-data) |
| Super nope | The 5-to-10-player match rule mentions it, but the four launch answers don't include it. Add a fifth answer or drop the clause | [Revival plan](product/revival-plan.md#when-is-it-a-match) |
| Default seen rule | A Letterboxd rating means the player has seen the film, so under the default "hide seen" a card never shows a seated player's rating of that film. "Allow rewatches rated 4★ or more" as the default would | [Data model](architecture/data-model.md#the-room) |
| Countries at launch | Which countries get streaming availability ingested decides most of the database size | [Sizes and speed](architecture/data-model.md#sizes-and-speed) |
| Hosting cap month | "Resets on the 1st" in UTC or in the host's time zone. Only matters once Pro exists | [Monetization](product/monetization.md) |
| Re-export reminder | Watchlist changes and films marked watched without a diary entry only refresh with a new export. Suggest one every 6 months, before Watchlist Showdown, or only when a gap is found | [Keeping it fresh](integrations/letterboxd.md#keeping-it-fresh) |

## Dropped

| Idea | Why |
| --- | --- |
| Connecting by typing a Letterboxd username (revival plan) | Anyone could type anyone's username |
| Keeping Letterboxd history per username, shared by every account that links it | Whatever is attached to a username goes to whoever types it; Letterboxd's terms forbid an index of its content |
| An embedded browser that catches the export download | Passwords typed into our app, Letterboxd can block it, and Android doesn't hand the file to the app |
| TypeScript Edge Functions for deck refills and outside calls (revival plan) | Replaced by the recommendation server |
