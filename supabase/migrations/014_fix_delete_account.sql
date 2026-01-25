-- Migration: Fix delete_user_account to also clean activity_log.tagged_friends
-- The original implementation only cleaned reviews.tagged_friends

-- Update the cleanup function to handle both tables
CREATE OR REPLACE FUNCTION public.cleanup_tagged_friends(deleted_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Clean reviews.tagged_friends
  UPDATE reviews
  SET tagged_friends = array_remove(tagged_friends, deleted_user_id)
  WHERE deleted_user_id = ANY(tagged_friends);

  -- Clean activity_log.tagged_friends
  UPDATE activity_log
  SET tagged_friends = array_remove(tagged_friends, deleted_user_id)
  WHERE deleted_user_id = ANY(tagged_friends);
END;
$$;

COMMENT ON FUNCTION public.cleanup_tagged_friends(UUID) IS
'Removes a deleted user ID from all tagged_friends arrays in reviews and activity_log tables.';
