-- Migration: Add performance indexes for commonly queried tables
-- These indexes optimize the most frequently used queries in the app

-- Activity log composite index (heavily queried for feed, stats, rankings)
CREATE INDEX IF NOT EXISTS idx_activity_log_user_status_content
ON activity_log(user_id, status, content_id);

-- Activity log index for feed queries (user + created_at ordering)
CREATE INDEX IF NOT EXISTS idx_activity_log_user_created
ON activity_log(user_id, created_at DESC);

-- Rankings composite index for position lookups
CREATE INDEX IF NOT EXISTS idx_rankings_user_type_position
ON rankings(user_id, content_type, rank_position);

-- Bookmarks composite index
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_content
ON bookmarks(user_id, content_id);

-- Comments ordering index (uses review_id)
CREATE INDEX IF NOT EXISTS idx_comments_review_created
ON comments(review_id, created_at DESC);

-- Notifications composite index for efficient inbox queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_read_created
ON notifications(user_id, read, created_at DESC);

-- Follows indexes for follower/following lookups
CREATE INDEX IF NOT EXISTS idx_follows_follower
ON follows(follower_id);

CREATE INDEX IF NOT EXISTS idx_follows_following
ON follows(following_id);

-- Content table index for TMDB lookups
CREATE INDEX IF NOT EXISTS idx_content_tmdb_type
ON content(tmdb_id, content_type);

-- Watch history for movie watch dates
CREATE INDEX IF NOT EXISTS idx_watch_history_user_movie
ON watch_history(user_id, movie_id);

-- Likes index for review lookups (uses review_id)
CREATE INDEX IF NOT EXISTS idx_likes_review
ON likes(review_id);

-- Comment likes index
CREATE INDEX IF NOT EXISTS idx_comment_likes_comment
ON comment_likes(comment_id);
