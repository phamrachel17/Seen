-- Migration: Add RPC function for batch ranking shift
-- This eliminates O(n) individual updates when inserting a new ranking

CREATE OR REPLACE FUNCTION shift_rankings_down(
  p_user_id UUID,
  p_content_type TEXT,
  p_from_position INT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Shift all rankings at or after the given position down by 1
  -- Done in a single UPDATE instead of N individual updates
  UPDATE rankings
  SET
    rank_position = rank_position + 1,
    updated_at = NOW()
  WHERE user_id = p_user_id
    AND content_type = p_content_type
    AND rank_position >= p_from_position;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION shift_rankings_down(UUID, TEXT, INT) TO authenticated;
