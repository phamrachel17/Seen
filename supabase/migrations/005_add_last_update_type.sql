-- Migration: Add last_update_type column to track what changed in review updates

ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS last_update_type TEXT;

-- Values: 'rating_changed', 'review_added', 'review_updated', 'watch_date_added'
COMMENT ON COLUMN public.reviews.last_update_type IS 'Tracks type of last update: rating_changed, review_added, review_updated, watch_date_added';
