-- Migration: Add half-star rating support
-- Changes star_rating from INTEGER to NUMERIC(2,1) to support 1.5, 2.5, etc.
-- Valid values: 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5
-- Existing integer values are preserved exactly

-- Step 1: Drop the existing CHECK constraint
ALTER TABLE public.activity_log
DROP CONSTRAINT IF EXISTS activity_log_star_rating_check;

-- Step 2: Change column type from INTEGER to NUMERIC(2,1)
-- This preserves all existing integer values (1, 2, 3, 4, 5)
ALTER TABLE public.activity_log
ALTER COLUMN star_rating TYPE NUMERIC(2,1) USING star_rating::NUMERIC(2,1);

-- Step 3: Add new CHECK constraint for half-star values
-- Valid values: 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5
-- The constraint (star_rating * 2) = FLOOR(star_rating * 2) ensures only .0 or .5 decimals
ALTER TABLE public.activity_log
ADD CONSTRAINT activity_log_star_rating_check
CHECK (
  star_rating >= 1
  AND star_rating <= 5
  AND (star_rating * 2) = FLOOR(star_rating * 2)
);

-- Update comment
COMMENT ON COLUMN public.activity_log.star_rating IS 'Rating 1-5 with half-star increments (1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5), only for completed activities';
