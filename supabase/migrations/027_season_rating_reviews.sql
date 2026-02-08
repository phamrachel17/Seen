-- Migration: Add review_text column to season_ratings table
-- Allows users to add a mini review for each season rating

ALTER TABLE public.season_ratings
ADD COLUMN review_text TEXT;

COMMENT ON COLUMN public.season_ratings.review_text IS 'Optional mini review for the season (visible to friends)';
