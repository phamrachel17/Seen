-- Migration: Create season_ratings table for per-season TV show ratings
-- Season ratings are separate from overall show ratings/rankings
-- Only the overall show appears in rankings, not individual seasons

CREATE TABLE IF NOT EXISTS public.season_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content_id INTEGER NOT NULL REFERENCES public.content(id) ON DELETE CASCADE,
  season_number INTEGER NOT NULL CHECK (season_number >= 1),
  star_rating NUMERIC(2,1) NOT NULL CHECK (
    star_rating >= 1
    AND star_rating <= 5
    AND (star_rating * 2) = FLOOR(star_rating * 2)
  ),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Each user can only have one rating per season per show
  UNIQUE(user_id, content_id, season_number)
);

-- Enable RLS
ALTER TABLE public.season_ratings ENABLE ROW LEVEL SECURITY;

-- Users can view their own season ratings
CREATE POLICY "Users can view own season ratings"
  ON public.season_ratings FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can view friends' season ratings
CREATE POLICY "Users can view friends season ratings"
  ON public.season_ratings FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.follows
    WHERE follower_id = auth.uid() AND following_id = user_id
  ));

-- Users can insert their own season ratings
CREATE POLICY "Users can insert own season ratings"
  ON public.season_ratings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own season ratings
CREATE POLICY "Users can update own season ratings"
  ON public.season_ratings FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own season ratings
CREATE POLICY "Users can delete own season ratings"
  ON public.season_ratings FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_season_ratings_user_content
  ON public.season_ratings(user_id, content_id);

CREATE INDEX IF NOT EXISTS idx_season_ratings_content
  ON public.season_ratings(content_id);

-- Comments
COMMENT ON TABLE public.season_ratings IS 'Per-season star ratings for TV shows (separate from overall show ranking)';
COMMENT ON COLUMN public.season_ratings.star_rating IS 'Rating 1-5 with half-star increments (1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5)';
COMMENT ON COLUMN public.season_ratings.season_number IS 'Season number (1-indexed)';
