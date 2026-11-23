-- Cloudflare D1 Schema Migration: 0001_init.sql
-- Master vocabulary table (words) and review history table (review_logs)

CREATE TABLE IF NOT EXISTS words (
  id TEXT PRIMARY KEY,
  english TEXT NOT NULL,
  ipa TEXT NOT NULL,
  pos TEXT NOT NULL,
  chinese_sense TEXT NOT NULL,
  original_context TEXT,
  usage_notes TEXT,
  examples_json TEXT NOT NULL CHECK (json_valid(examples_json) AND json_array_length(examples_json) >= 1),
  added_at TEXT NOT NULL,
  stage INTEGER NOT NULL DEFAULT 0 CHECK (stage BETWEEN 0 AND 5),
  next_review_date TEXT NOT NULL,
  last_feedback TEXT CHECK (last_feedback IN ('remembered', 'familiar', 'forgotten') OR last_feedback IS NULL),
  last_feedback_at TEXT,
  paused INTEGER NOT NULL DEFAULT 0 CHECK (paused IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_words_due
  ON words(paused, next_review_date);

CREATE TABLE IF NOT EXISTS review_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  word_id TEXT NOT NULL REFERENCES words(id),
  review_date TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('remembered', 'familiar', 'forgotten')),
  stage_before INTEGER NOT NULL CHECK (stage_before BETWEEN 0 AND 5),
  next_review_date_before TEXT NOT NULL,
  stage_after INTEGER NOT NULL CHECK (stage_after BETWEEN 0 AND 5),
  next_review_date_after TEXT NOT NULL,
  first_reviewed_at TEXT NOT NULL,
  reviewed_at TEXT NOT NULL,
  press_count INTEGER NOT NULL DEFAULT 1,
  UNIQUE(word_id, review_date)
);

CREATE INDEX IF NOT EXISTS idx_review_logs_date
  ON review_logs(review_date);
