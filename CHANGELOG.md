# Changelog

## v2026.10.20.7 — 2026-10-20

- Match the table background to the page, remove the outer frame, widen and raise the game area, and keep instant-deal controls outside the player seating area.
- Center a smaller hand count in the tray header and group icon-only layout and arrangement controls beside it. Preserve tooltips, accessible names, and manual tray resizing.
- Display each player's remaining hand size in a colored numeric badge, including disconnected and autoplay seats. Highlight hands approaching the 25-card knockout threshold.
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
