-- Migration: Add delete_user_account function for secure self-deletion
-- This function allows authenticated users to delete their own account

-- Clean up tagged_friends arrays (no FK constraint)
CREATE OR REPLACE FUNCTION public.cleanup_tagged_friends(deleted_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE reviews
  SET tagged_friends = array_remove(tagged_friends, deleted_user_id)
  WHERE deleted_user_id = ANY(tagged_friends);
END;
$$;

-- Main delete account function
CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID;
BEGIN
  current_user_id := auth.uid();

  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Clean up tagged_friends references
  PERFORM public.cleanup_tagged_friends(current_user_id);

  -- Delete avatar from storage
  DELETE FROM storage.objects
  WHERE bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = current_user_id::text;

  -- Delete from auth.users - cascades to all other tables
  DELETE FROM auth.users WHERE id = current_user_id;
END;
$$;

-- Grant execute permission to authenticated users only
REVOKE ALL ON FUNCTION public.delete_user_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION public.delete_user_account() IS
'Allows authenticated users to permanently delete their own account and all associated data. This action is irreversible.';
