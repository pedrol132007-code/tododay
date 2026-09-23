CREATE TABLE member (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '',
  contact TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL,
  position REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE card ADD COLUMN status TEXT NOT NULL DEFAULT 'planned'
  CHECK (status IN ('planned', 'in_progress', 'done'));
ALTER TABLE card ADD COLUMN requested_by INTEGER REFERENCES member(id);

CREATE INDEX idx_card_requested_by ON card(requested_by);
