# No Mercy Table

A real-time, room-code multiplayer card game for 3–6 players, deployed on Cloudflare Workers with a dedicated D1 database.

**Play:** https://no-mercy-table.passion-fruit.workers.dev/

**Release:** v2026.10.20.9

Click another player's avatar for five original cartoon props: tomato, water bucket, rubber ducks, spring glove, and rainbow confetti. All seated players see the same attributed event, with shared animation timing and server-enforced cooldowns. Props preserve hands, turns, card logs and match replays. They support pause/resume, the existing mute setting and reduced motion. No production database migration is required.

Rounds continue after each successful finisher. Finishers receive places in order and leave the turn/exchange rotation; the final active player is the last-place loser. A final draw attack or roulette resolves fully before granting a place, and a returned penalty can cancel a provisional finish. Finishers, knockouts, and players who withdraw can spectate every remaining live hand. Active seats never receive those opponent hands, and spectators cannot play, reorder, or enable autoplay. Replays still contain public plays and counts only.

Scores accumulate within the same room, including negative totals, and settle exactly once per completed round. Four-player standings award +4, +2, 0, and −1. Three players use +2, 0, −1; five use +6, +4, +2, 0, −1; six use +8, +6, +4, +2, 0, −1. Successful finishers lead the standings, then later knockouts or withdrawals, with the final active player last. From round two, the previous first-place finisher starts if still seated. Host removal revokes the old seat's HTTP and WebSocket access; removed participants stay in that round's history and leave the seating list on reset.

The table uses a wide, frame-free layout with a compact hand count, icon-only hand tools, and side-toolbar instant dealing. New actions interrupt old animations and announcements; progressive draws and actual card choices still follow the game rules. A top-right feedback form stores nicknames and messages in a dedicated D1 table.

Feedback is visible to the account owner at **Cloudflare Dashboard → Storage & databases → D1 → no-mercy-table-db → Studio → player_feedback**. The public game exposes submission only; it has no endpoint for listing feedback. Entries include `nickname`, `message`, UTC `created_at`, and `release`. Repeated submission ids are deduplicated; the server caps new feedback at 30 entries per minute without retaining IP addresses.

Private WebSocket room updates use Cloudflare Durable Objects, with server-driven dealing and bot turns, reconnect support, host pause/resume, and temporary autoplay. D1 remains the authoritative room store so existing rooms can be retained. See [CHANGELOG.md](CHANGELOG.md) for release details.

## Features

- Multiplayer rooms with no account required, plus bots for solo testing.
- Continuing placements until one final player remains, plus live hand spectating for finishers, knockouts, and withdrawn players.
- Persistent room scores, previous-winner starting turns, and host removal controls with seat-access revocation.
- Five synchronized, original avatar props with distinct animation and sound.
- Host-controlled settings synchronized to every player before the game starts.
- Three seven-card modes: exchange one card, swap whole hands, or choose during play. The host can allow or require an exchange.
- An optional directional whole-table rotation after playing zero. A final zero that clears a hand retains the immediate finishing rule.
- Two draw modes, configurable dealing speed, and an instant-deal option.
- Flat or overlapping hands, manual card ordering, and optional automatic arrangement.
- Animated card exchanges, cumulative draw penalties, color roulette, voice effects, and screen shake.
- Interruptible action announcements, directed draw attacks, and individual card deliveries, with per-device shake strength.
- Conflict-aware action retries that preserve intent, deduplicate accepted actions, and retain simultaneous manual hand ordering.
- A resizable hand tray with proportionally scaled card faces and automatic spectator collapse after knockout.
- Current-turn indicators, attributed penalty chains, and explanations for unplayable cards.
- Post-game highlights and an optional public-event replay with seeking and playback speed controls. Drawn cards and hidden hands are excluded, and replay history is withheld until the round ends.
- Private player hands, seat credentials, and server-authoritative game state.

## Requirements

- Node.js 22.13 or later.
- A Cloudflare account with Workers, D1, and SQLite-backed Durable Objects enabled for deployment.

## Local development

```sh
npm ci
npm run dev
```

Open the local URL printed by the development server. Local D1 data is separate from the production database.

To enable feedback on a new local database, run `npx wrangler d1 execute DB --local --file drizzle/0001_player_feedback.sql`.

## Verification

```sh
npm test
npm run typecheck
npm run build
```

GitHub Actions runs these checks for pushes to `main` and pull requests.

## Deploy to Cloudflare

The included `wrangler.jsonc` targets the `no-mercy-table` Worker and its dedicated `no-mercy-table-db` D1 database, using the `DB` binding. The `ROOMS` binding and `room-hub-v1` migration provision a SQLite-backed `RoomHub` namespace on deployment. Before upgrading from v2026.10.20.6 or earlier, apply the additive feedback-table SQL below. It preserves existing room records and can be applied more than once.

```sh
npx wrangler login
npx wrangler d1 execute DB --remote --file drizzle/0001_player_feedback.sql
npm run build
npm run deploy
```

To deploy to another Cloudflare account, update `account_id`, create a dedicated D1 database, and set its `database_id` in `wrangler.jsonc`. Keep the binding name `DB`.

Initialize a new database once:

```sh
npm run db:apply
npx wrangler d1 execute DB --remote --file drizzle/0001_player_feedback.sql
```

## Repository contents

This repository contains the game source, database schema, audio assets, and tests. Dependencies, generated builds, local databases, live room data, and authentication credentials are excluded.

Cloudflare deployment currently uses Wrangler. Pushing to GitHub stores a versioned source backup and runs verification; deployment is a separate step.
