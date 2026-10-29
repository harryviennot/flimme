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
| One deck pipeline for every player: confidence (how much we know about them) decides how much their fit leans on their own taste or on what people generally like | 29 Oct 2026 | [Scoring a film for a player](architecture/deck-engine.md#scoring-a-film-for-a-player) |
| Taste is long-term, card memory short-term: a nope always keeps the film away for a while, but counts for taste only when it's probably about taste. A real opinion (Letterboxd rating, taste check, after-game answer) beats any swipe | 29 Oct 2026 | [Signals](architecture/deck-engine.md#signals) |
| Films come back between games according to what happened the last time (card memory), with a weighted shuffle, variety on every deal and at most one Rematch per game. Nothing is banned outright | 29 Oct 2026 | [Freshness](architecture/deck-engine.md#freshness) |
| A new `card_history` table records, per player and film, what happened the last time they were shown it | 29 Oct 2026 | [Changes to the data model](architecture/deck-engine.md#changes-to-the-data-model) |
| Default seen rule: `allow_rewatch` (only films everyone who has seen them rated 4★ or more), at most 1 card in 10, labelled with the rating. Date Night keeps `hide_seen` | 29 Oct 2026 | [Building a deal](architecture/deck-engine.md#building-a-deal) |
| Moods are data: rules, example films and keyword hints give every film a score per mood. Only the host picks them; per-player moods and genres are dropped | 29 Oct 2026 | [Moods](architecture/deck-engine.md#moods) |
| Moods never change a player's long-term taste | 29 Oct 2026 | [Moods](architecture/deck-engine.md#moods) |
| The taste check is only for players we know little about, asks about the film rather than tonight, doesn't mark films as seen, and never repeats a film | 29 Oct 2026 | [The taste check](architecture/deck-engine.md#the-taste-check) |
| Every number the deck engine uses lives in a recipe: a base plus changes per mode, in `rec.deck_recipes` | 29 Oct 2026 | [Recipes](architecture/deck-engine.md#recipes) |

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
| Deck engine starting values: signal values, fatigue penalties and half-lives, confidence, a shuffle temperature of 0.3, 3 cards in 4 from tonight's moods, and the rest | Placeholders until playtests | [Starting values](architecture/deck-engine.md#starting-values) |
| Swipes in rooms with an age cap under 13 count at 30% toward a player's own taste | What a parent swipes with the kids says little about their own taste | [Signals](architecture/deck-engine.md#signals) |

## Open

| Question | Notes | Details |
| --- | --- | --- |
| The app's name | `app.json` says FilmFlicker, the repo says MovieMatch, and the stores already list MatchMovie and similar names | [Revival plan](product/revival-plan.md#decisions-for-you) |
| Money: whether and when to charge | Any revenue needs a TMDB commercial license. The monetization doc recommends launching free, then Host Pro with the family modes | [Monetization](product/monetization.md) |
| The recommendation server's language | Python recommended: the ranking and training libraries are there, and the contract with the database is SQL and JSON. TypeScript with training in Python is the alternative | [Recommendation server](architecture/recommendation-server.md) |
| Letterboxd ratings as features in a model trained across players | Fine for a player's own recommendations; the shared model is the grey area. Needs a short legal read before launch | [Using the data](integrations/letterboxd.md#using-the-data) |
| Super nope | The 5-to-10-player match rule mentions it, but the four launch answers don't include it. Add a fifth answer or drop the clause | [Revival plan](product/revival-plan.md#when-is-it-a-match) |
| Mood list and definitions | The current design's six moods are a start. Each needs its example films and keyword hints checked with the review script before launch | [Moods](architecture/deck-engine.md#moods) |
| "Reading the room" banner after the warm-up | Optional fun beat built from the room's leanings; needs a realtime event | [How a game unfolds](architecture/deck-engine.md#how-a-game-unfolds) |
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
| Each player picking genres or moods for tonight (old app, data model draft) | The host's moods replace them; each player's taste profile covers the rest |
| A taste check asking "Would you watch it tonight?", with answers marking films as seen | It mixed tonight with taste, and hid films people only meant they'd like to watch |
| "This or that" pairs for the taste check | The single cards are designed and catch "I won't watch this at all"; pairs could be tested later |
