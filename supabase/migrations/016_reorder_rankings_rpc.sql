-- Migration: Add RPC function for atomic batch ranking reorder
-- This eliminates N+1 queries during drag-and-drop reordering

CREATE OR REPLACE FUNCTION reorder_rankings_batch(
  p_user_id UUID,
  p_content_type TEXT,
  p_rankings JSONB -- Array of {id, rank_position, display_score}
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update all rankings in a single transaction using JSONB array
  UPDATE rankings r
  SET
    rank_position = (item->>'rank_position')::INT,
    display_score = (item->>'display_score')::DECIMAL,
    updated_at = NOW()
  FROM jsonb_array_elements(p_rankings) AS item
  WHERE r.id = (item->>'id')::UUID
    AND r.user_id = p_user_id
    AND r.content_type = p_content_type;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION reorder_rankings_batch(UUID, TEXT, JSONB) TO authenticated;
