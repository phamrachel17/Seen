-- Add lead_actor column to content table
-- This stores the first-billed cast member from TMDB for calculating "Favorite Actor" insights

ALTER TABLE public.content
ADD COLUMN lead_actor TEXT;

COMMENT ON COLUMN public.content.lead_actor IS 'Lead actor name from TMDB (first billed cast member)';

-- Create index for actor queries
CREATE INDEX IF NOT EXISTS idx_content_lead_actor ON public.content(lead_actor);
