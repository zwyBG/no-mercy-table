CREATE TABLE IF NOT EXISTS player_feedback (
  id TEXT PRIMARY KEY NOT NULL,
  nickname TEXT NOT NULL,
  message TEXT NOT NULL,
  release TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS player_feedback_created_at ON player_feedback(created_at DESC);
