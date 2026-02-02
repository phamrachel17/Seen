-- Migration: Add 'bookmarked' status to activity_log
-- This allows bookmark events to appear in the feed

-- Drop existing constraint
ALTER TABLE public.activity_log DROP CONSTRAINT IF EXISTS activity_log_status_check;

-- Add new constraint with 'bookmarked' status
ALTER TABLE public.activity_log ADD CONSTRAINT activity_log_status_check
  CHECK (status IN ('completed', 'in_progress', 'bookmarked'));
