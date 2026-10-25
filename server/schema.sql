-- Satu baris per permainan yang dikirim pemain yang setuju berbagi data.
CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  v INTEGER, brain INTEGER, n INTEGER,
  result TEXT, winner TEXT,
  src TEXT,   -- hash IP per jam, hanya untuk membatasi spam; dihapus setelah 2 hari
  hour TEXT,
  body TEXT NOT NULL,
  taught INTEGER NOT NULL DEFAULT 0  -- sudah diperiksa guru otomatis
);
CREATE INDEX IF NOT EXISTS games_src_hour ON games (src, hour);

-- Label dari guru otomatis (LLM) untuk pesan yang membuat aturan ragu. Satu baris per pesan.
CREATE TABLE IF NOT EXISTS teacher (
  game_id INTEGER NOT NULL,
  idx INTEGER NOT NULL,
  label TEXT NOT NULL,
  model TEXT,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (game_id, idx)
);
CREATE INDEX IF NOT EXISTS games_taught ON games (taught);
