# Changelog

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
