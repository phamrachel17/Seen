-- Migration: Create activity_log table for unified activity tracking

-- Create activity_log table
CREATE TABLE IF NOT EXISTS public.activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content_id INTEGER NOT NULL REFERENCES public.content(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('completed', 'in_progress')),

  -- Completed activity fields
  star_rating INTEGER CHECK (star_rating >= 1 AND star_rating <= 5),
  review_text TEXT,

  -- In Progress activity fields
  note TEXT,
  progress_minutes INTEGER CHECK (progress_minutes >= 0),
  progress_season INTEGER CHECK (progress_season >= 1),
  progress_episode INTEGER CHECK (progress_episode >= 1),

  -- Common fields
  watch_date DATE,
  tagged_friends UUID[],
  is_private BOOLEAN DEFAULT FALSE,

  -- For TV: which season this rating applies to (null = overall show)
  rated_season INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

-- Users can view their own activities
CREATE POLICY "Users can view own activities"
  ON public.activity_log FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can view public activities from others (for feed, friends' activity)
CREATE POLICY "Users can view public activities"
  ON public.activity_log FOR SELECT
  TO authenticated
  USING (is_private = false);

-- Users can insert their own activities
CREATE POLICY "Users can insert own activities"
  ON public.activity_log FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own activities (limited - activities are mostly immutable)
CREATE POLICY "Users can update own activities"
  ON public.activity_log FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own activities
CREATE POLICY "Users can delete own activities"
  ON public.activity_log FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON public.activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_content_id ON public.activity_log(content_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_status ON public.activity_log(status);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON public.activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_user_content ON public.activity_log(user_id, content_id);

-- Composite index for feed queries
CREATE INDEX IF NOT EXISTS idx_activity_log_feed
  ON public.activity_log(user_id, is_private, created_at DESC);

COMMENT ON TABLE public.activity_log IS 'Unified activity log for completed and in-progress watching';
COMMENT ON COLUMN public.activity_log.status IS 'Activity status: completed or in_progress';
COMMENT ON COLUMN public.activity_log.star_rating IS 'Rating 1-5, only for completed activities';
COMMENT ON COLUMN public.activity_log.progress_minutes IS 'Minutes watched, for movies in progress';
COMMENT ON COLUMN public.activity_log.progress_season IS 'Current season, for TV in progress';
COMMENT ON COLUMN public.activity_log.progress_episode IS 'Current episode, for TV in progress';
COMMENT ON COLUMN public.activity_log.rated_season IS 'For per-season ratings on TV shows';
