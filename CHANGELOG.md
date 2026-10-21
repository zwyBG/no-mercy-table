# Changelog

## v2026.10.21.1 — 2026-10-21

- Add exact-face jump-in for other players and consecutive self-plays, with private matching-card hints, highlighted hands, and explicit jump controls, including pending zero/seven/roulette dialogs. Preserve ordinary penalty stacking as a separate action.
- Choose jump direction along the shortest active-seat path from the previous player; self/tied paths retain the pre-effect direction. Execute the replacement card once, replacing the previous penalty chain, reverse/skip effect, or unexecuted choice. Skipped seats cannot jump the blocking card.
- Close jump windows when actual drawing or hand transfer starts, or a zero/seven decision completes. Bind requests to the physical top-card id, serialize simultaneous jump attempts, and preserve idempotent retry, finish placements, hand privacy, public replay, and interruptible effects.
- Send authenticated player commands over the existing room WebSocket, with explicit acknowledgements immediately after D1 commit. Retain HTTP recovery with the same action id when a connection or acknowledgement is lost, and negotiate support so older clients and servers remain compatible.
- Route HTTP commands and fallback ticks through the same Durable Object queue as socket commands and server alarms. Avoid extra edge-to-room round trips, acknowledge without waiting for broadcasts, and skip obsolete queued notifications.
- Cache presence briefly while overlaying current socket connections. Restore all transient caches after object hibernation and preserve existing seat-revocation checks and private hand boundaries.
- Coalesce manual hand-order changes into background saves that do not hold the foreground play/draw lock. Preserve local card movement, newly received cards, and room/round boundaries.
- Display connection round-trip time, update HTTP-only games from tick responses immediately, shorten visible fallback polling, and send heartbeats separately at a lower rate.
- Add coverage for live acknowledgement matching, duplicate and lost acknowledgements, HTTP recovery, serial queue failures, background sorting, and command validation. Validate live play, concurrent sorting, spectator privacy, kick revocation, and HTTP-only drawing in isolated rooms.
- Cover jump-in seat paths for 3–6 players, self-jumps, replacement effects, skip restrictions, pending-choice cancellation, closed windows, ranking, privacy, stale top cards, and simultaneous requests. Verify desktop and mobile controls against isolated local fixtures.

## v2026.10.20.9 — 2026-10-20

- Add the zero owner's choice to rotate active players' hands in the current direction or keep their hands. Preserve exact manual order when keeping hands; record the public decision in replay and support bot choices. A final zero that empties a hand keeps the existing immediate placement behavior.
- Remove persistent autoplay status labels while preserving opt-in autoplay and the management-menu reclaim control.
- Rebase harmless concurrent room updates against current state, retry bounded compare-and-swap conflicts, deduplicate accepted requests, and reject genuinely changed turn intent. Coalesce manual sorting requests without discarding newly received cards.
- Let new gameplay, delivery, social, and voice effects interrupt earlier presentation instead of accumulating a queue. Remove animation-only action gates on clients, the server, and bots; keep actual dealing, progressive draw, choice, pause, and knockout rules.
- Grant live hand spectating to voluntary withdrawals as well as winners and knockouts. Offer withdrawal with continued viewing and preserve seat credentials for a later spectator reconnect.
- Add persistent per-room scores, exactly-once completed-round settlement, negative totals, compact seat totals, and a scored final ranking. For 3–6 players award two-point steps down to zero for the penultimate place, then −1 for last place. Rank finishers first, followed by reverse knockout/withdrawal order, with the final active player last.
- Start subsequent rounds with the previous first-place finisher when still seated, with the original lobby starter as fallback.
- Add confirmed host removal in the lobby and game-management menu. Preserve cards and ongoing choices safely, revoke removed-seat HTTP and WebSocket access, and clear removed seats at the next lobby reset.
- Add regression coverage for score schedules, persistence and deduplication, next-round starters, withdrawal spectating, host permissions, seat revocation, and removal during timed or pending work.

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
