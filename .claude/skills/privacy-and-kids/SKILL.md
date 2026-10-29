---
name: privacy-and-kids
description: The privacy, security and child-safety rules every change must keep (personal data in logs and analytics, rooms with an age cap, names and reports, secrets). Use when touching logging, analytics, accounts, room settings, anything a player can type or see about another player, or secrets.
---

# Privacy and kids

Background: docs/product/privacy.md, docs/product/analytics.md#consent-and-kids and docs/architecture/security.md, by section.

## Personal data

- **No personal data in logs, crash reports or analytics:** ids only. Never names, room codes, emails, Letterboxd usernames or tokens.
- **PostHog gets only what the server can't see** (screens, prompts, taps), through the `track()` wrapper. Never swipes, film ids or Letterboxd data. Game metrics come from the database.
- **Analytics by region:** anonymous in the EU, the UK and Switzerland unless the player opts in; identified elsewhere; the opt-out in Settings always works.
- **Development builds send nothing** to PostHog; every event carries its environment.
- Deleting an account deletes everything about the player except anonymous seats.

## Rooms with an age cap under 13

- No PostHog events from the room.
- No trailer button (YouTube's next video isn't ours to control).
- The cap applies to the deck, the taste check and reason labels too.
- Swipes count at 30% toward a player's own taste.

## What players can put in front of others

- Display names are normalised and filtered (English and French blocklist); avatars are presets only; reactions come from a fixed emoji set.
- The host can remove a player (who can't rejoin) and lock the room; anyone can report a player.
- Never show who noped a film or what someone voted (the `realtime-contract` skill).

## Secrets

- Nothing secret in git. `.env.local` files are git-ignored and agents never read or write them (a hook and the permissions refuse it).
- `EXPO_PUBLIC_` values end up inside the app: never put a secret there.
- The Supabase secret key lives only in the server's HTTP API process.
- Agents get read-only access to staging at most, never production.

## Kids and the stores

- Copy never says "for kids"; the app is rated 13+ until family profiles exist.
- No store or payment screen is ever shown where a child could tap it (later: behind a parental gate on the host's phone).
