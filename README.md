# No Mercy Table

A real-time, room-code multiplayer card game for 3–6 players, deployed on Cloudflare Workers with a dedicated D1 database.

**Play:** https://no-mercy-table.passion-fruit.workers.dev/

**Release:** v2026.10.20.5

This release adds private WebSocket room updates with Cloudflare Durable Objects, server-driven dealing and bot turns, reconnect support, host pause/resume, and temporary autoplay. D1 remains the authoritative room store so existing rooms can be retained. See [CHANGELOG.md](CHANGELOG.md) for release details.

## Features

- Multiplayer rooms with no account required, plus bots for solo testing.
- Host-controlled settings synchronized to every player before the game starts.
- Three seven-card modes: exchange one card, swap whole hands, or choose during play. The host can allow or require an exchange.
- Two draw modes, configurable dealing speed, and an instant-deal option.
- Flat or overlapping hands, manual card ordering, and optional automatic arrangement.
- Animated card exchanges, cumulative draw penalties, color roulette, voice effects, and screen shake.
- Ordered action announcements, directed draw attacks, and individual card deliveries, with per-device shake strength.
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

## Verification

```sh
npm test
npm run typecheck
npm run build
```

GitHub Actions runs these checks for pushes to `main` and pull requests.

## Deploy to Cloudflare

The included `wrangler.jsonc` targets the `no-mercy-table` Worker and its dedicated `no-mercy-table-db` D1 database, using the `DB` binding. The `ROOMS` binding and `room-hub-v1` migration provision a SQLite-backed `RoomHub` namespace on deployment. Existing D1 room records remain in place; this upgrade requires no D1 schema migration.

```sh
npx wrangler login
npm run build
npm run deploy
```

To deploy to another Cloudflare account, update `account_id`, create a dedicated D1 database, and set its `database_id` in `wrangler.jsonc`. Keep the binding name `DB`.

Initialize a new database once:

```sh
npm run db:apply
```

## Repository contents

This repository contains the game source, database schema, audio assets, and tests. Dependencies, generated builds, local databases, live room data, and authentication credentials are excluded.

Cloudflare deployment currently uses Wrangler. Pushing to GitHub stores a versioned source backup and runs verification; deployment is a separate step.
