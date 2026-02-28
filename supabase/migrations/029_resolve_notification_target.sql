-- Resolve notification review_id to navigation data, bypassing RLS.
-- Safe because a notification's existence proves the user was tagged/mentioned.

CREATE OR REPLACE FUNCTION public.resolve_notification_target(p_review_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  -- Try activity_log first (joined with content for navigation data)
  SELECT json_build_object(
    'type', 'activity',
    'id', a.id,
    'tmdb_id', c.tmdb_id,
    'content_type', c.content_type,
    'title', c.title,
    'poster_url', c.poster_url,
    'status', a.status
  ) INTO result
  FROM activity_log a
  JOIN content c ON c.id = a.content_id
  WHERE a.id = p_review_id;

  IF result IS NOT NULL THEN
    RETURN result;
  END IF;

  -- Fallback: legacy reviews table (content_type always 'movie')
  SELECT json_build_object(
    'type', 'review',
    'id', r.id,
    'tmdb_id', r.movie_id,
    'content_type', 'movie',
    'title', m.title,
    'poster_url', m.poster_url,
    'status', 'completed'
  ) INTO result
  FROM reviews r
  LEFT JOIN movies m ON m.id = r.movie_id
  WHERE r.id = p_review_id;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_notification_target(UUID) TO authenticated;
