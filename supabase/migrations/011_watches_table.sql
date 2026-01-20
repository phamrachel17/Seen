-- Migration: Add watches table for grouping activities into viewing cycles
-- A "watch" represents one continuous viewing cycle of a title (including rewatches)

-- Create watches table
CREATE TABLE IF NOT EXISTS public.watches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content_id INTEGER NOT NULL REFERENCES public.content(id) ON DELETE CASCADE,
  watch_number INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX idx_watches_user_content ON public.watches(user_id, content_id);
CREATE INDEX idx_watches_status ON public.watches(status);
CREATE UNIQUE INDEX idx_watches_user_content_number ON public.watches(user_id, content_id, watch_number);

-- Add watch_id column to activity_log to link activities to watches
ALTER TABLE public.activity_log ADD COLUMN IF NOT EXISTS watch_id UUID REFERENCES public.watches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_activity_log_watch_id ON public.activity_log(watch_id);

-- Enable Row Level Security
ALTER TABLE public.watches ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own watches
CREATE POLICY "Users can view own watches" ON public.watches
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own watches" ON public.watches
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own watches" ON public.watches
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own watches" ON public.watches
  FOR DELETE USING (auth.uid() = user_id);

-- Migrate existing in-progress activities to Watch #1
-- This creates a watch for each unique user/content combination that has in-progress activities
INSERT INTO public.watches (id, user_id, content_id, watch_number, status, started_at)
SELECT
  gen_random_uuid(),
  user_id,
  content_id,
  1,
  'in_progress',
  MIN(created_at)
FROM public.activity_log
WHERE status = 'in_progress'
GROUP BY user_id, content_id;

-- Link existing in-progress activities to their newly created watches
UPDATE public.activity_log a
SET watch_id = w.id
FROM public.watches w
WHERE a.user_id = w.user_id
  AND a.content_id = w.content_id
  AND a.status = 'in_progress';
