# Changelog

## v2026.10.20.8 — 2026-10-20

- Add five original avatar props: tomato splats, water buckets, rubber-duck spectators, spring gloves, and rainbow confetti, with distinct flights, reactions, captions, and synthesized sounds.
- Synchronize interactions through existing private room updates. Enforce individual and room cooldowns, wait for current card work, and resume normal gameplay after each interaction.
- Preserve card state and match history; skip stale effects after reconnecting and respect pause, mute, and reduced-motion preferences.
- Continue rounds after successful finishers, recording their places and excluding them from subsequent turns and exchanges. Resolve final attacks and roulette before confirming a finish; identify the last active player as the last-place loser and retain knockout records separately.
- Automatically grant finished and knocked-out seats a read-only view of every remaining player's live hand. Collapse the hand tray on entering spectating and allow it to be reopened and resized. Keep opponent hands private from active seats and out of public replays.
- Add placement labels, a complete final standings list, and public finish checkpoints in the match replay. Reset ranks and spectator permissions for the next round.

## v2026.10.20.7 — 2026-10-20

- Match the table background to the page, remove the outer frame, widen and raise the game area, and keep instant-deal controls outside the player seating area.
- Center a smaller hand count in the tray header and group icon-only layout and arrangement controls beside it. Preserve tooltips, accessible names, and manual tray resizing.
- Display opponents' remaining hand sizes in colored numeric badges, including disconnected and autoplay seats. Highlight hands approaching the 25-card knockout threshold; keep the local player's count only in the hand-tray header.
- Add a feedback form with nickname and message fields, validated and deduplicated D1 storage, and owner-only review through Cloudflare D1 Studio.
- Lock turn-advancing actions during announcements and card animations on both client and server. Bots wait for the same presentation deadline, and returning tabs skip stale announcements.

## v2026.10.20.6 — 2026-10-20

- Recover from a lost or timed-out response to an authenticated seat action by retrying once with the identical action id. The existing server deduplication prevents an accepted action from running twice; room creation and joining are never automatically replayed.
- Resynchronize the room after a connection failure, preserve the seat and hand, and display a clear message when the result of an action could not be confirmed.
- Preserve download timeout errors so interrupted JSON responses can use the same recovery path, while keeping rule validation errors unchanged.

## v2026.10.20.5 — 2026-10-20

- Replace frequent table polling with authenticated WebSocket updates and server alarms for timed game work. Retain HTTP fallback and reconnect seats after backgrounding or network loss.
- Add host pause/resume and temporary player autoplay, preserving timed dealing, penalties, exchanges, and result reveals across pauses.
- Keep the hand and actions accessible on mobile, preserve manual ordering, and explain why a selected card cannot be played.
- Display the current color, turn, direction, and complete attributed draw-penalty chain.
- Queue announcements without cutting off earlier voices; animate attacks from the issuing player to the recipient and send drawn cards individually to the receiving seat.
- Animate whole-hand exchanges through gathering, passing, receiving, and spreading. Add local screen-shake strength settings.
- Add post-game penalty, exchange, and final-play highlights, plus optional public-event playback with seeking and speed controls. Keep private hand contents out of replay data.
- Add a vertically resizable hand tray that collapses after the local player's knockout reveal, and address attack captions only to their actual recipient.
- Fix card artwork, numerals, and corner labels scaling out of alignment when the hand tray is shortened.

## v2026.10.20.1 — 2026-10-20

- Initial Cloudflare release with room-code multiplayer, bots, configurable rules, progressive dealing, manual hand ordering, and seven-card exchange modes.
