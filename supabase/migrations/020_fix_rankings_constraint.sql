-- Migration: Fix unique constraint to allow batch reordering
-- The existing constraint causes "duplicate key value" errors during reorder_rankings_batch
-- because PostgreSQL checks the constraint row-by-row during UPDATE, not at transaction end.
--
-- Solution: Make the constraint DEFERRABLE INITIALLY DEFERRED so it's only checked at COMMIT.

-- Drop the existing unique constraint (it may have different names depending on how it was created)
ALTER TABLE rankings
DROP CONSTRAINT IF EXISTS rankings_user_content_type_position_key;

ALTER TABLE rankings
DROP CONSTRAINT IF EXISTS rankings_user_id_content_type_rank_position_key;

ALTER TABLE rankings
DROP CONSTRAINT IF EXISTS rankings_user_id_rank_position_key;

-- Recreate the unique constraint as DEFERRABLE INITIALLY DEFERRED
-- This allows temporary duplicates during batch updates, checked only at COMMIT
ALTER TABLE rankings
ADD CONSTRAINT rankings_user_content_type_position_key
UNIQUE (user_id, content_type, rank_position)
DEFERRABLE INITIALLY DEFERRED;

-- Also update the RPC to explicitly defer constraints during reorder
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
  -- Defer constraint checking until end of transaction
  SET CONSTRAINTS rankings_user_content_type_position_key DEFERRED;

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

  -- Constraint will be checked here at implicit COMMIT
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION reorder_rankings_batch(UUID, TEXT, JSONB) TO authenticated;
