-- Add episode_runtime column for TV shows
-- This column stores the average runtime per episode in minutes
ALTER TABLE public.content
ADD COLUMN IF NOT EXISTS episode_runtime INTEGER;

-- Add comment explaining the field
COMMENT ON COLUMN public.content.episode_runtime IS 'Average runtime per episode in minutes (for TV shows only)';
