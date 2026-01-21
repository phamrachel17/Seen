-- Backfill activities for existing rankings
-- This script creates completed activities for rankings that don't have them
-- Run this in your Supabase SQL Editor

-- Step 1: First, let's see what rankings need activities
-- (This is a SELECT query to preview what will be created)
SELECT
  r.id as ranking_id,
  r.user_id,
  r.movie_id,
  m.title as movie_title,
  r.created_at as ranking_date,
  c.id as content_id,
  (
    SELECT COUNT(*)
    FROM activity_log a
    WHERE a.user_id = r.user_id
    AND a.content_id = c.id
    AND a.status = 'completed'
  ) as existing_activities
FROM rankings r
JOIN movies m ON m.id = r.movie_id
LEFT JOIN content c ON c.tmdb_id = r.movie_id AND c.content_type = 'movie'
ORDER BY r.created_at;

-- Step 2: Ensure all ranked movies exist in the content table
-- (Run this to create missing content records)
INSERT INTO content (tmdb_id, content_type, title, poster_url, backdrop_url, release_year, runtime_minutes, director, genres, synopsis, popularity_score, collection_id, collection_name)
SELECT DISTINCT
  m.id as tmdb_id,
  'movie' as content_type,
  m.title,
  m.poster_url,
  m.backdrop_url,
  m.release_year,
  m.runtime_minutes,
  m.director,
  m.genres,
  m.synopsis,
  m.popularity_score,
  m.collection_id,
  m.collection_name
FROM rankings r
JOIN movies m ON m.id = r.movie_id
WHERE NOT EXISTS (
  SELECT 1 FROM content c
  WHERE c.tmdb_id = m.id
  AND c.content_type = 'movie'
)
ON CONFLICT (tmdb_id, content_type) DO NOTHING;

-- Step 3: Create completed activities for rankings that don't have them
-- This uses a default star rating of 3 - you can update these later
INSERT INTO activity_log (
  user_id,
  content_id,
  status,
  star_rating,
  watch_date,
  is_private,
  created_at
)
SELECT
  r.user_id,
  c.id as content_id,
  'completed' as status,
  3 as star_rating, -- Default rating, can be updated later
  r.created_at as watch_date,
  false as is_private,
  r.created_at as created_at
FROM rankings r
JOIN movies m ON m.id = r.movie_id
JOIN content c ON c.tmdb_id = r.movie_id AND c.content_type = 'movie'
WHERE NOT EXISTS (
  SELECT 1 FROM activity_log a
  WHERE a.user_id = r.user_id
  AND a.content_id = c.id
  AND a.status = 'completed'
)
ON CONFLICT DO NOTHING;

-- Step 4: Verify the activities were created
SELECT
  r.id as ranking_id,
  m.title as movie_title,
  a.id as activity_id,
  a.star_rating,
  a.watch_date,
  r.created_at as ranking_created
FROM rankings r
JOIN movies m ON m.id = r.movie_id
JOIN content c ON c.tmdb_id = r.movie_id AND c.content_type = 'movie'
JOIN activity_log a ON a.content_id = c.id AND a.user_id = r.user_id AND a.status = 'completed'
ORDER BY r.rank_position;
