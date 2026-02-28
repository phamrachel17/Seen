-- Drop unused friendships table (replaced by follows table)
-- The friendships table used pending/accepted/rejected friend requests.
-- It was fully replaced by the follows table (instant follow, no approval).
-- Zero references exist in application code.

DROP TABLE IF EXISTS public.friendships;
