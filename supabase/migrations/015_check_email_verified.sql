-- Migration: Add function to check if an email is verified
-- This allows the client to distinguish between verified and unverified accounts

CREATE OR REPLACE FUNCTION public.check_email_verified(check_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_verified BOOLEAN;
BEGIN
  SELECT (email_confirmed_at IS NOT NULL) INTO is_verified
  FROM auth.users
  WHERE email = LOWER(check_email);

  RETURN COALESCE(is_verified, FALSE);
END;
$$;

-- Allow anonymous and authenticated users to call this
-- (needed for signup flow before user is authenticated)
GRANT EXECUTE ON FUNCTION public.check_email_verified(TEXT) TO anon, authenticated;

COMMENT ON FUNCTION public.check_email_verified(TEXT) IS
'Checks if an email address has been verified. Returns true if verified, false if unverified or not found.';
