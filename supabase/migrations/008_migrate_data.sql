-- Migration: Migrate existing movies and reviews to new unified tables
-- This migration:
-- 1. Migrates movies → content (with content_type = 'movie')
-- 2. Migrates reviews → activity_log (with status = 'completed')
-- 3. Adds content_id column to rankings and migrates data
-- 4. Adds content_id column to bookmarks and migrates data

-- Step 1: Migrate movies to content table
INSERT INTO public.content (
  tmdb_id,
  content_type,
  title,
  poster_url,
  backdrop_url,
  release_year,
  runtime_minutes,
  director,
  genres,
  synopsis,
  popularity_score,
  collection_id,
  collection_name,
  created_at
)
SELECT
  id AS tmdb_id,
  'movie' AS content_type,
  title,
  poster_url,
  backdrop_url,
  release_year,
  runtime_minutes,
  director,
  genres,
  synopsis,
  popularity_score::REAL,
  collection_id,
  collection_name,
  created_at
FROM public.movies
ON CONFLICT (tmdb_id, content_type) DO NOTHING;

-- Step 2: Migrate reviews to activity_log
INSERT INTO public.activity_log (
  id,
  user_id,
  content_id,
  status,
  star_rating,
  review_text,
  tagged_friends,
  is_private,
  created_at
)
SELECT
  r.id,
  r.user_id,
  c.id AS content_id,
  'completed' AS status,
  r.star_rating,
  r.review_text,
  r.tagged_friends,
  r.is_private,
  r.created_at
FROM public.reviews r
JOIN public.content c ON c.tmdb_id = r.movie_id AND c.content_type = 'movie'
ON CONFLICT (id) DO NOTHING;

-- Step 3: Add content_id column to rankings
ALTER TABLE public.rankings ADD COLUMN IF NOT EXISTS content_id INTEGER REFERENCES public.content(id) ON DELETE CASCADE;

-- Populate content_id in rankings from movie_id
UPDATE public.rankings r
SET content_id = c.id
FROM public.content c
WHERE c.tmdb_id = r.movie_id AND c.content_type = 'movie'
AND r.content_id IS NULL;

-- Step 4: Add content_id column to bookmarks
ALTER TABLE public.bookmarks ADD COLUMN IF NOT EXISTS content_id INTEGER REFERENCES public.content(id) ON DELETE CASCADE;

-- Populate content_id in bookmarks from movie_id
UPDATE public.bookmarks b
SET content_id = c.id
FROM public.content c
WHERE c.tmdb_id = b.movie_id AND c.content_type = 'movie'
AND b.content_id IS NULL;

-- Create indexes for new content_id columns
CREATE INDEX IF NOT EXISTS idx_rankings_content_id ON public.rankings(content_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_content_id ON public.bookmarks(content_id);

-- Add comments
COMMENT ON COLUMN public.rankings.content_id IS 'Reference to unified content table (new)';
COMMENT ON COLUMN public.bookmarks.content_id IS 'Reference to unified content table (new)';

-- Note: We keep movie_id columns for backward compatibility during transition
-- A future migration can drop them once all code is updated to use content_id

