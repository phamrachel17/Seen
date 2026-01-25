-- Fix shift_rankings_down to process in descending order
-- This avoids unique constraint violations by moving higher positions first
-- When shifting positions [4, 5] to [5, 6], if position 4 is updated to 5 before
-- position 5 is updated to 6, it conflicts with the existing unique constraint.
-- By processing in descending order (5→6 first, then 4→5), we avoid this.

CREATE OR REPLACE FUNCTION shift_rankings_down(
  p_user_id UUID,
  p_content_type TEXT,
  p_from_position INT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r RECORD;
BEGIN
  -- Process in DESCENDING order to avoid unique constraint violations
  -- Higher positions move first: 5→6, then 4→5 (no conflict)
  FOR r IN
    SELECT id FROM rankings
    WHERE user_id = p_user_id
      AND content_type = p_content_type
      AND rank_position >= p_from_position
    ORDER BY rank_position DESC
  LOOP
    UPDATE rankings
    SET rank_position = rank_position + 1, updated_at = NOW()
    WHERE id = r.id;
  END LOOP;
END;
$$;
