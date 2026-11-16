-- Visitor feedback (see lib/feedback-store.ts). Safe to re-run.
--   psql "$DATABASE_URL" -f scripts/sql/feedback.sql
CREATE TABLE IF NOT EXISTS feedback (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  rating     smallint    NOT NULL CHECK (rating BETWEEN 1 AND 5),
  message    text        CHECK (char_length(message) <= 2000),
  country    char(2)     NOT NULL
);

CREATE INDEX IF NOT EXISTS feedback_created_at_idx ON feedback (created_at DESC);
