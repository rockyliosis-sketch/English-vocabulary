-- Add display-only related words. Apply BEFORE deploying code that reads this column.
-- Existing words receive []; no review state or review_logs are changed.
ALTER TABLE words ADD COLUMN related_words_json TEXT DEFAULT '[]';
