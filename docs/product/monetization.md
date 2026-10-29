# MovieMatch monetization options

How MovieMatch can earn money, built on the [revival plan](revival-plan.md). Written in October 2026.

> Copied from `harryviennot/MovieMatch`, branch `claude/artifact-monetization-options-igb96l` (commit bd62ba7). The data model built from it is in [architecture/data-model.md](../architecture/data-model.md).

- **Live doc:** https://claude.ai/artifact/N54RivFVXNtisRTjJDtYX4 (private until shared from its Share menu). This file is a snapshot of it from 29 October 2026.
- **Revival plan:** https://claude.ai/artifact/BtN7AF4dE9zfBTvZpxWckg, which left money as an open decision.

Bet on parents: anyone can host 3 games a month for free, kids always play free, and parents pay for Host Pro, family game modes and deck packs. The night pass, affiliate links, sponsored cards and a venue mode come second.

## Constraints

Four facts from the revival plan decide which options are safe.

- **The first euro needs a TMDB license.** TMDB calls a project commercial when its main purpose is revenue, and that covers ads, subscriptions and affiliate links. TMDB publishes no price; one third-party source quotes $149/month under $1M revenue, unconfirmed. Ask sales@themoviedb.org for a quote.

  > Since: TMDB staff confirmed the $149 a month commercial plan for under $1 million revenue (forum, 31 March 2026). TMDB's terms may also require the commercial agreement for the recommendation engine itself, before any revenue: see [integrations/tmdb.md](../integrations/tmdb.md#terms-licence-and-attribution).
- **Letterboxd features stay free and must not copy Letterboxd Pro.** Its terms (section 6.4) forbid recreating paid-only features "through our API or another means". Letterboxd Pro includes stats pages, filtering by your services and alerts when watchlist films reach them. So no paid stats or alerts built on imported Letterboxd data.
- **Guests drive growth.** Each movie night brings 2 to 9 people who did not choose the app. Never charge them to join or swipe, which rules out a paid app and a swipe cap.
- **The host is the buyer.** One person per group creates the room, usually once or twice a week. Pricing should target that person.

## The family bet

Parents host and pay; kids join free as guests on a tablet, an old phone or the web link. Revenue comes from Host Pro, family game modes and deck packs.

- **Parents are the host by default.** They set up movie night, so the Pro the host buys covers the whole family.
- **The pain is real.** Finding a film that a 7-year-old, a teenager and two adults all accept is the argument this app ends.
- **The cap bites at the right time.** A family that watches together every week reaches the 3 free games in week 4.
- **Safety is free, fun is paid.** Free hosts keep a basic age filter, so a first free game never shows a horror poster to a 7-year-old. The modes below are Pro, and Family Sharing lets both parents host on one subscription.

### Family game modes (Pro)

| Mode | What it does |
| --- | --- |
| Family profiles | Kid profiles under the parent's account: nickname, avatar, age. The youngest viewer's age sets the rating cap, and the deck learns each kid's taste over time. |
| Pass and play | One phone or tablet goes round the couch, with a cover screen between players so votes stay secret. For kids without a device. |
| Parent veto | Kids swipe freely, and each parent gets one veto in the Final Cut. |
| Kid's choice night | The kid of the night gets a golden ticket: their likes count double. It rotates each week. |
| Tournament bracket | 8 or 16 films face off two at a time until one wins. |
| Double feature | Picks 2 or 3 films that fit a weekend time budget. |

The revival plan's later modes join them: Pick for me and the era and language filters. Watchlist Showdown stays free because it runs on Letterboxd data.

### Family packs

All packs are included in Pro, or €0.99 to €1.99 each. Name them by theme, not by studio, to stay clear of trademarks.

- First scary movie (gentle spooky)
- Animated classics
- Talking animals
- Holiday family classics
- Sports underdogs
- Sing-along musicals

## Kids' safety and privacy

Kids play but never pay, never see an ad and never hand over personal data. These rules keep parents' trust and the app clear of child-privacy law.

- **No store on kid screens.** Paywalls and purchase buttons appear only on the host's phone, behind a parental gate.
- **No ads, affiliate links or sponsored cards in rooms with kids.** Rewarded ads and "Watch now" links show only on the host's device.
- **Minimal kid data.** A kid profile holds a nickname, an avatar and an age, never an email or a photo. The parent creates it, consents and can delete it.
- **The law.** COPPA covers under-13s in the US. In France, a child under 15 needs a parent's consent for online services under GDPR.
- **No tracking of kids.** Analytics count rooms and swipes in aggregate, never per kid profile.
- **General audience, not the Kids category.** Apple's Kids category restricts third-party analytics and ads and adds stricter review; a family app for all ages doesn't need it.
- **Store age rating.** The rating will likely follow the most mature posters the app can show, so some locked-down kid devices may not install it. The web join link covers them.

> Checked in [store-listing.md](store-listing.md#age-ratings): an honest rating is 13+ on Apple, and Apple reserves "For Kids" wording for its Kids Category, so the pitch stays "the whole family". What the law asks for kids in each market, and what family profiles need before they're built, is in [privacy.md](privacy.md#children).

## Options compared

Three options work from day one and fit together: Host Pro, the night pass and deck packs. The rest add income once the app has players.

| Option | How it works | Price (suggested) or payout | Needs before it pays | Verdict |
| --- | --- | --- | --- | --- |
| Host Pro | The host subscribes for unlimited hosting past the free 3 games a month, and everyone in their room gets Pro for that game, as in Kahoot or Jackbox. The family modes are the main draw, and guests see Pro working, which sells it. | €2.99/month or €14.99/year | Nothing beyond launch | Do first |
| Movie Night Pass | 24 hours of Pro and unlimited hosting, bought once. Fits groups who meet monthly and won't subscribe. Offer yearly after a second pass. | €1.49 | Nothing beyond launch | Do first |
| Themed deck packs | Curated decks bought once: Halloween horror, Oscar winners, animated classics, first scary movie, Christmas romcoms. They are filters on the catalog, so nearly free to make. | €0.99 to €1.99 each, or included in Pro | Nothing beyond launch | Do first |
| Affiliate links on the winner screen | Tagged "rent it" and free-trial links at the match, labelled as affiliate, on the host's device only. Netflix pays nothing and decks show owned services, so most wins earn nothing. | $0.10 to about $12 per conversion (see payouts) | A "rent it" or "worth a trial" deck option | Add alongside |
| Rewarded video ads | Watch 30 seconds to host one more game this month or unlock Pro modes for tonight, a free alternative to the pass. Host's device only, never in rooms with kids. No banners or interstitials. | Ad network rates (not checked) | Enough non-paying hosts to matter | Add alongside |
| Venue mode | A TV or projector view with a QR code where 20 to 200 people vote on what to screen. For bars, cine clubs, hostels, outdoor cinemas. The venue handles screening rights. | €9 to €29/month per venue | 3 to 5 free pilot venues first | Pilot |
| Sponsored cards and packs | Distributors pay to place a release in decks, labelled "Sponsored", at most 1 card in 20, only when the group score is decent, and never in rooms with kids. | Direct deals | Tens of thousands of monthly players | Later at scale |
| License the group engine | Sell the group recommender and live rooms to a cinema chain ("pick a film and showtime together") or a TV or streaming app. | Negotiated | Proof: time to match, crews back within 30 days | Later at scale |

Letterboxd Pro, at about $19/year, is the price film fans already know, so €14.99/year sits just under it.

## Free vs Host Pro

Anyone can host 3 games a month for free, and everything a guest touches and every Letterboxd feature stays free. Pro removes the hosting cap and adds depth, and the whole room gets it during that host's games.

| Feature | Tier | Why |
| --- | --- | --- |
| Host up to 3 games a month | Free | Covers groups that meet every week or two; weekly groups reach the cap in week 4 |
| Join by code, link or QR, in the app or on the web | Free | Guests are the growth loop |
| Unlimited swiping, the four answers, undo | Free | No swipe cap is the edge over ReelMatch |
| Quick Match, Final Cut, Date Night | Free | The launch modes that end a night with a pick |
| Mood chips and time budget | Free | Part of getting to a match fast |
| Basic age filter (a rating cap) | Free | Safety is never paywalled; it lets parents try the app with kids |
| Letterboxd import, seen filter, watchlist overlap, Watchlist Showdown | Free | Letterboxd terms, and it is the main differentiator |
| Match screen, where to watch, recap share card with app link | Free | The recap card is free marketing |
| Unlimited hosting | Pro | The main reason a weekly group pays |
| Crews and history: saved groups, what you watched, how often you agree | Pro | Built from in-app votes only, never imported Letterboxd data |
| Family modes: profiles, pass and play, parent veto, kid's choice, bracket, double feature | Pro | The main reason parents pay (see The family bet) |
| Pick for me (solo) | Pro | Useful between group nights |
| Era, language, hidden gems and guilty pleasures filters | Pro | Depth for film fans |
| Custom decks: the host pastes a shortlist and the group swipes it | Pro | Settles "we already have five ideas" |
| Bigger rooms: free up to 6 players, Pro up to 20 | Pro | Big parties; a full room asks the host, never a guest, to upgrade |
| All deck packs | Pro | Makes yearly better value than buying packs |

### How the hosting cap works

Three free games a month keeps the app useful for most groups and gives weekly groups a reason to pay.

- **Why 3, not fewer.** The revival plan measures success by crews back within 30 days. One or two games a month would stop a group before the habit forms.
- **What counts.** A game counts once swiping starts. Empty lobbies, abandoned rooms and rejoins after a dropped connection don't count.
- **Never cut a game.** The check runs when the host creates a room, so a night already underway always finishes.
- **Reset.** The count resets on the 1st of each month. The lobby shows "2 free games left this month".
- **At the cap.** Offer the €1.49 Night Pass, Host Pro, or a rewarded ad for one more game. Guests can still join any room.
- **Per account.** The first game can be hosted anonymously; Apple or Google sign-in is asked before the second, so reinstalling doesn't reset the count. Guests stay anonymous.
- **Rotating hosts is fine.** A crew of 4 taking turns gets 12 free games a month. That turns guests into hosts with accounts, which is growth, not a leak.
- **When.** Switch the cap on with Pro, not at launch, so early groups never hit it.

## Affiliate payouts

Payouts run from $0.10 to about $12 per conversion, and most figures come from affiliate directories, so check them in each network's dashboard before relying on them.

| Program | Pays | How sure |
| --- | --- | --- |
| [Disney+](https://uppromote.com/affiliate-directory/disney/) | Up to $11 per signup, 30-day cookie | Directory, unconfirmed |
| [Paramount+](https://www.flexoffers.com/affiliate-programs/paramount-affiliate-program/) | $7.20 to $12 per signup, 10-day window, US only | Directories disagree, unconfirmed |
| [Amazon Prime Video](https://affiliate-program.amazon.com/help/node/topic/GRXPHT8U84RAYDXZ/) | $2.00 per free-trial signup | Amazon's own compensation page |
| [Fandango](https://www.flexoffers.com/affiliate-programs/fandango-affiliate-program) | About $0.10 per ticket, $2 per gift card | Directories, unconfirmed |
| [Apple Performance Partners](https://performance-partners.apple.com/program-overview) | Commission on Apple TV subscriptions and movie sales; rate not public | Apple's page; only accepts high-volume partners |
| Peacock | Pays per signup through Impact; rate not found | Directory |
| Netflix | Nothing | No affiliate program (general knowledge, not checked) |

The deck filters to services the group already has, so affiliate income only grows if you add a "rent it" or "worth a trial" option to the room settings.

## Recommended sequence

Earn nothing until people come back on their own, then switch on the three launch options in one release.

1. **Launch free.** Track the revival plan's metrics: time to first match and crews back within 30 days. Earning nothing keeps you non-commercial under TMDB while you get their quote. Include 3 to 5 families with kids in the closed beta.
    - Gate: crews come back within 30 days at a rate you set before launch.

      > Defined in [analytics.md](analytics.md#every-metric) as groups back within 30 days; 25% suggested.
2. **Turn on the 3-games-a-month hosting cap, Host Pro with the family modes, the Night Pass, deck packs and winner-screen affiliate links in one release.** Sign the TMDB license the same week. Use RevenueCat for purchases, and join Apple's Small Business Program so Apple takes 15% instead of 30%.
    - Gate: TMDB license signed.
3. **Add rewarded ads and pilot venue mode.** Rewarded ads only if many hosts skip the pass. Run venue mode free with 3 to 5 venues before building billing.
    - Gate: pilot venues use it each month without help.
4. **Year two: sponsored cards and packs, then engine licensing talks.** Approach distributors and cinema chains with real numbers.
    - Gate: tens of thousands of monthly players, and median time to match you can show.

## Break-even

About 200 to 300 yearly subscribers cover the fixed costs, and the TMDB license is most of that bill.

| Fixed cost once commercial | Amount |
| --- | --- |
| TMDB commercial license | Unknown; $149/month if the [third-party figure](https://api.market/blog/sleeyax/entertainment/best-movie-apis) holds |
| [Supabase Pro](https://supabase.com/pricing) | $25/month |
| Streaming Availability API | A plan sized for winner-only lookups; not priced yet |
| Apple Developer Program | $99/year, about $8/month |
| **Total** | **About $200 to $250/month** |

> Streaming Availability is dropped from v1: the winner screen only says where to watch, so that line costs nothing. See [decisions.md](../decisions.md). The full monthly bill, checked on 29 October 2026, is in [operations.md](../architecture/operations.md#monthly-costs).

At €14.99/year you keep about €10.60 per subscriber in France (after 20% VAT and Apple's 15%) and about $12.70 in the US. That makes roughly 200 to 300 subscribers. If 2 to 5% of active hosts subscribe (an assumption, typical for freemium), you need about 4,000 to 15,000 active hosts.

Without the $149 figure, costs fall to about $35 to $60/month and break-even to under 100 subscribers. Get the TMDB quote early: it decides how big the app must be.

## Not recommended

Each of these either blocks guests, breaks a data source's terms, or costs trust.

- **Paid app upfront.** Guests would have to pay to join a friend's room.
- **Swipe caps.** ReelMatch limits free users to 15 swipes a day; no cap is your edge.
- **Banner and full-screen ads.** They interrupt the match moment on every phone at once, and MatchMovie sells "no ads" as a feature.
- **Selling user data.** Imported Letterboxd data belongs to its members, Letterboxd forbids building an index of its content, and watch history is personal data under GDPR.
- **Charging for Letterboxd features.** It risks Letterboxd's terms, and those features are why people would pick this app.

## Sources

- [MovieMatch Revival Plan](https://claude.ai/artifact/BtN7AF4dE9zfBTvZpxWckg): constraints, stack costs, competitors
- [TMDB FAQ](https://developer.themoviedb.org/docs/faq): what counts as commercial, sales contact
- [api.market: best movie APIs](https://api.market/blog/sleeyax/entertainment/best-movie-apis): the $149/month TMDB figure
- [Letterboxd terms of use](https://letterboxd.com/legal/terms-of-use/): sections 6.4, 6.8, 6.9
- [Letterboxd paid subscriptions](https://letterboxd.com/about/pro/): Pro and Patron features
- [Letterboxd App Store prices](https://www.apppricinglab.com/app/apple/1054271011): Pro about $19/year
- [ReelMatch](https://reelmatch.app/): 15 free swipes a day, Pro subscription
- [Amazon Associates compensation](https://affiliate-program.amazon.com/help/node/topic/GRXPHT8U84RAYDXZ/)
- [Apple Performance Partners](https://performance-partners.apple.com/program-overview)
- [Paramount+ affiliate program](https://www.flexoffers.com/affiliate-programs/paramount-affiliate-program/)
- [Disney+ affiliate program](https://uppromote.com/affiliate-directory/disney/)
- [Peacock affiliate program](https://uppromote.com/affiliate-directory/peacock/)
- [Fandango affiliate program](https://www.flexoffers.com/affiliate-programs/fandango-affiliate-program)
- [Supabase pricing](https://supabase.com/pricing)
