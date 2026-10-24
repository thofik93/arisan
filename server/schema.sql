-- Satu baris per permainan yang dikirim pemain yang setuju berbagi data.
CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  v INTEGER, brain INTEGER, n INTEGER,
  result TEXT, winner TEXT,
  src TEXT,   -- hash IP per jam, hanya untuk membatasi spam; dihapus setelah 2 hari
  hour TEXT,
  body TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS games_src_hour ON games (src, hour);
