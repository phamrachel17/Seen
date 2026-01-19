-- Migration: Add unique constraint to prevent duplicate COMPLETED activities
-- For movies: one completed activity per user per content
-- For TV: one completed activity per user per content per rated_season
-- Note: In-progress activities are NOT constrained - users can have multiple to track watch history

-- First, clean up any existing duplicate COMPLETED activities (keep the most recent)
DELETE FROM public.activity_log a
WHERE a.status = 'completed'
AND a.id NOT IN (
  SELECT DISTINCT ON (user_id, content_id, COALESCE(rated_season, -1)) id
  FROM public.activity_log
  WHERE status = 'completed'
  ORDER BY user_id, content_id, COALESCE(rated_season, -1), created_at DESC
);

-- Create unique index for COMPLETED activities only (handles NULL rated_season correctly)
-- COALESCE converts NULL rated_season to -1 so the index can properly handle overall show ratings
CREATE UNIQUE INDEX IF NOT EXISTS activity_log_unique_completed
ON public.activity_log (user_id, content_id, COALESCE(rated_season, -1))
WHERE status = 'completed';

-- NO constraint on in_progress - users can have multiple in-progress logs to track their watch history
-- This allows: "watched 30 mins on Jan 1, then 45 mins on Jan 2, then finished on Jan 3"
