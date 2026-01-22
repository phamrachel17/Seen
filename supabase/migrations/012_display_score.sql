-- Migration: Rename elo_score to display_score for 1-10 rating system
-- The elo_score column was unused (always 1500), repurposing for display scores

-- Step 1: Rename column
ALTER TABLE public.rankings
RENAME COLUMN elo_score TO display_score;

-- Step 2: Update comment
COMMENT ON COLUMN public.rankings.display_score IS '1-10 display score derived from position in rankings';

-- Step 3: Add constraint for valid score range (0.0-10.0)
ALTER TABLE public.rankings
ADD CONSTRAINT valid_display_score
CHECK (display_score IS NULL OR (display_score >= 0.0 AND display_score <= 10.0));

-- Note: After running this migration, execute the backfill query to calculate scores:
-- WITH ranked AS (
--   SELECT id, user_id, content_type, rank_position,
--     COUNT(*) OVER (PARTITION BY user_id, content_type) AS total_count
--   FROM rankings
-- )
-- UPDATE rankings r
-- SET display_score = ROUND(
--   10.0 - ((ranked.rank_position - 1.0) / GREATEST(ranked.total_count - 1, 1)) * 9.0,
--   1
-- )
-- FROM ranked
-- WHERE r.id = ranked.id;
