-- Migration: Add watch_history table for tracking watch dates and rewatches

CREATE TABLE public.watch_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  movie_id INTEGER NOT NULL REFERENCES public.movies(id) ON DELETE CASCADE,
  watched_at DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Prevent duplicate entries for same user+movie+date
  UNIQUE(user_id, movie_id, watched_at)
);

-- Index for efficient lookups by user
CREATE INDEX idx_watch_history_user_id ON public.watch_history(user_id);

-- Index for efficient lookups by user+movie (for review modal)
CREATE INDEX idx_watch_history_user_movie ON public.watch_history(user_id, movie_id);

-- Enable RLS
ALTER TABLE public.watch_history ENABLE ROW LEVEL SECURITY;

-- Users can view their own watch history
CREATE POLICY "Users can view own watch history"
  ON public.watch_history FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own watch history
CREATE POLICY "Users can insert own watch history"
  ON public.watch_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own watch history
CREATE POLICY "Users can delete own watch history"
  ON public.watch_history FOR DELETE
  USING (auth.uid() = user_id);

-- Grant permissions
GRANT SELECT, INSERT, DELETE ON public.watch_history TO authenticated;

COMMENT ON TABLE public.watch_history IS
'Tracks when users watched movies. Supports multiple entries per movie for rewatches.';
