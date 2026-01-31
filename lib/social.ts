import { supabase } from './supabase';
import { Comment, Notification, User, Review, WatchHistoryEntry } from '@/types';

// ============ MOVIE RATINGS ============

export async function getMovieAverageRating(
  movieId: number
): Promise<{ average: number; count: number } | null> {
  // First, get the content_id for this TMDB movie
  const { data: contentData } = await supabase
    .from('content')
    .select('id')
    .eq('tmdb_id', movieId)
    .eq('content_type', 'movie')
    .single();

  if (!contentData) {
    return null;
  }

  // Query activity_log for completed activities with star ratings
  const { data, error } = await supabase
    .from('activity_log')
    .select('star_rating')
    .eq('content_id', contentData.id)
    .eq('status', 'completed')
    .eq('is_private', false)
    .not('star_rating', 'is', null);

  if (error || !data || data.length === 0) return null;

  const sum = data.reduce((acc, r) => acc + (r.star_rating || 0), 0);
  return {
    average: sum / data.length,
    count: data.length,
  };
}

// ============ LIKES ============

export async function likeReview(
  userId: string,
  reviewId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('likes')
    .insert({ user_id: userId, review_id: reviewId });

  return !error;
}

export async function unlikeReview(
  userId: string,
  reviewId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('likes')
    .delete()
    .eq('user_id', userId)
    .eq('review_id', reviewId);

  return !error;
}

export async function getReviewLikes(
  reviewId: string,
  currentUserId?: string
): Promise<{ count: number; likedByUser: boolean }> {
  const { count, error } = await supabase
    .from('likes')
    .select('id', { count: 'exact', head: true })
    .eq('review_id', reviewId);

  if (error) {
    return { count: 0, likedByUser: false };
  }

  let likedByUser = false;
  if (currentUserId) {
    const { data } = await supabase
      .from('likes')
      .select('id')
      .eq('review_id', reviewId)
      .eq('user_id', currentUserId)
      .maybeSingle();
    likedByUser = !!data;
  }

  return { count: count || 0, likedByUser };
}

export async function toggleLike(
  userId: string,
  reviewId: string,
  isCurrentlyLiked: boolean
): Promise<boolean> {
  if (isCurrentlyLiked) {
    return unlikeReview(userId, reviewId);
  } else {
    return likeReview(userId, reviewId);
  }
}

// ============ COMMENTS ============

export async function addComment(
  userId: string,
  reviewId: string,
  content: string
): Promise<Comment | null> {
  const { data, error } = await supabase
    .from('comments')
    .insert({
      user_id: userId,
      review_id: reviewId,
      content: content.trim(),
    })
    .select(`
      *,
      user:users!comments_user_id_fkey (id, username, display_name, profile_image_url)
    `)
    .single();

  if (error || !data) {
    console.error('Error adding comment:', error);
    return null;
  }

  // New comments start with 0 likes
  return { ...data, like_count: 0, liked_by_user: false } as Comment;
}

export async function deleteComment(commentId: string): Promise<boolean> {
  const { error } = await supabase
    .from('comments')
    .delete()
    .eq('id', commentId);

  return !error;
}

export async function getReviewComments(reviewId: string): Promise<Comment[]> {
  const { data, error } = await supabase
    .from('comments')
    .select(`
      *,
      user:users!comments_user_id_fkey (id, username, display_name, profile_image_url)
    `)
    .eq('review_id', reviewId)
    .order('created_at', { ascending: true });

  if (error || !data) {
    console.error('Error fetching comments:', error);
    return [];
  }

  return data as Comment[];
}

export async function getReviewCommentsWithLikes(
  reviewId: string,
  currentUserId?: string
): Promise<Comment[]> {
  // Fetch comments
  const { data: commentsData, error: commentsError } = await supabase
    .from('comments')
    .select(`
      *,
      user:users!comments_user_id_fkey (id, username, display_name, profile_image_url)
    `)
    .eq('review_id', reviewId)
    .order('created_at', { ascending: true });

  if (commentsError || !commentsData) {
    console.error('Error fetching review comments:', commentsError);
    return [];
  }

  if (commentsData.length === 0) {
    return [];
  }

  const commentIds = commentsData.map(c => c.id);

  // Fetch like counts for all comments
  const { data: likeCounts } = await supabase
    .from('comment_likes')
    .select('comment_id')
    .in('comment_id', commentIds);

  // Count likes per comment
  const likeCountMap = new Map<string, number>();
  for (const like of likeCounts || []) {
    likeCountMap.set(like.comment_id, (likeCountMap.get(like.comment_id) || 0) + 1);
  }

  // Check which comments current user has liked
  let userLikedSet = new Set<string>();
  if (currentUserId) {
    const { data: userLikes } = await supabase
      .from('comment_likes')
      .select('comment_id')
      .eq('user_id', currentUserId)
      .in('comment_id', commentIds);

    userLikedSet = new Set((userLikes || []).map(l => l.comment_id));
  }

  // Merge like data into comments
  return commentsData.map(comment => ({
    ...comment,
    like_count: likeCountMap.get(comment.id) || 0,
    liked_by_user: userLikedSet.has(comment.id),
  })) as Comment[];
}

export async function getCommentCount(reviewId: string): Promise<number> {
  const { count, error } = await supabase
    .from('comments')
    .select('id', { count: 'exact', head: true })
    .eq('review_id', reviewId);

  if (error) return 0;
  return count || 0;
}

// ============ NOTIFICATIONS ============

interface CreateNotificationData {
  user_id: string;
  actor_id: string;
  type: 'like' | 'comment' | 'tagged' | 'follow';
  review_id?: string;
  activity_id?: string; // Maps to review_id column since IDs match
  comment_id?: string;
}

export async function createNotification(
  data: CreateNotificationData
): Promise<void> {
  // Don't create notification if user is notifying themselves
  if (data.user_id === data.actor_id) return;

  // Map activity_id to review_id column since IDs match for migrated data
  const insertData: Record<string, unknown> = {
    user_id: data.user_id,
    actor_id: data.actor_id,
    type: data.type,
    review_id: data.review_id || data.activity_id, // Use activity_id if review_id not provided
    comment_id: data.comment_id,
  };

  const { error } = await supabase.from('notifications').insert(insertData);

  if (error) {
    console.error('Error creating notification:', error);
  }
}

export async function getNotifications(
  userId: string,
  limit: number = 50
): Promise<Notification[]> {
  // First fetch notifications with actor info
  const { data, error } = await supabase
    .from('notifications')
    .select(`
      *,
      actor:users!notifications_actor_id_fkey (id, username, display_name, profile_image_url)
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) {
    console.error('Error fetching notifications:', error);
    return [];
  }

  // For notifications with review_id (which maps to activity_id), fetch activity and content info
  // Use Promise.allSettled to handle individual fetch failures gracefully
  const results = await Promise.allSettled(
    data.map(async (notification) => {
      if (notification.review_id) {
        // Fetch activity to get content_id
        const { data: activity } = await supabase
          .from('activity_log')
          .select('id, content_id, content:content(id, tmdb_id, title, poster_url, content_type)')
          .eq('id', notification.review_id)
          .single();

        if (activity?.content) {
          return {
            ...notification,
            activity: {
              id: activity.id,
              content_id: activity.content_id,
              content: activity.content,
            },
          };
        }
      }
      return notification;
    })
  );

  // Filter out failed fetches and extract successful results
  const notificationsWithContent = results
    .filter((result): result is PromiseFulfilledResult<typeof data[0]> => result.status === 'fulfilled')
    .map((result) => result.value);

  return notificationsWithContent as Notification[];
}

export async function markNotificationRead(
  notificationId: string
): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', notificationId);

  if (error) {
    console.error('Error marking notification as read:', error);
  }
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', userId)
    .eq('read', false);

  if (error) {
    console.error('Error marking all notifications as read:', error);
  }
}

export async function getUnreadNotificationCount(
  userId: string
): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('read', false);

  if (error) return 0;
  return count || 0;
}

// ============ FRIEND HELPERS ============

export async function getFollowingUsers(
  userId: string
): Promise<Pick<User, 'id' | 'username' | 'display_name' | 'profile_image_url'>[]> {
  const { data, error } = await supabase
    .from('follows')
    .select(`
      following_id,
      users!follows_following_id_fkey (id, username, display_name, profile_image_url)
    `)
    .eq('follower_id', userId);

  if (error || !data) {
    console.error('Error fetching following users:', error);
    return [];
  }

  return data
    .map((f) => f.users as unknown as Pick<User, 'id' | 'username' | 'display_name' | 'profile_image_url'>)
    .filter(Boolean);
}

export async function getUsersByIds(
  userIds: string[]
): Promise<Pick<User, 'id' | 'username' | 'display_name' | 'profile_image_url'>[]> {
  if (userIds.length === 0) return [];

  const { data, error } = await supabase
    .from('users')
    .select('id, username, display_name, profile_image_url')
    .in('id', userIds);

  if (error || !data) {
    console.error('Error fetching users by IDs:', error);
    return [];
  }

  return data;
}

export async function getSuggestedFriends(
  userId: string,
  limit: number = 5
): Promise<Pick<User, 'id' | 'username' | 'display_name' | 'profile_image_url'>[]> {
  try {
    // First, try to get frequently tagged users from past reviews
    const { data: reviews } = await supabase
      .from('reviews')
      .select('tagged_friends')
      .eq('user_id', userId)
      .not('tagged_friends', 'eq', '{}');

    if (reviews && reviews.length > 0) {
      // Count frequency of tagged friends
      const tagCounts: Record<string, number> = {};
      for (const review of reviews) {
        if (review.tagged_friends) {
          for (const friendId of review.tagged_friends) {
            tagCounts[friendId] = (tagCounts[friendId] || 0) + 1;
          }
        }
      }

      // Sort by frequency and get top friends
      const sortedFriendIds = Object.entries(tagCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, limit)
        .map(([id]) => id);

      if (sortedFriendIds.length > 0) {
        const users = await getUsersByIds(sortedFriendIds);
        if (users.length >= limit) {
          return users.slice(0, limit);
        }
        // If not enough, continue to fill from following
        const remainingLimit = limit - users.length;
        const existingIds = new Set(users.map(u => u.id));
        const following = await getFollowingUsers(userId);
        const additionalUsers = following
          .filter(u => !existingIds.has(u.id))
          .slice(0, remainingLimit);
        return [...users, ...additionalUsers];
      }
    }

    // Fallback: return following users
    const following = await getFollowingUsers(userId);
    return following.slice(0, limit);
  } catch (error) {
    console.error('Error getting suggested friends:', error);
    // Final fallback: try to get following users
    const following = await getFollowingUsers(userId);
    return following.slice(0, limit);
  }
}

// ============ ACTIVITY LIKES/COMMENTS ============
// These functions work with activity_log entries
// Note: Since reviews were migrated to activity_log with the same IDs,
// we can reuse the existing likes/comments tables with activity IDs

export async function likeActivity(
  userId: string,
  activityId: string
): Promise<boolean> {
  // Use review_id column since activity IDs match review IDs for migrated data
  const { error } = await supabase
    .from('likes')
    .insert({ user_id: userId, review_id: activityId });

  if (error) {
    console.error('Error liking activity:', error);
    // FK constraint error means the activity doesn't have a corresponding review
    // Run migration 010_activity_likes_support.sql to fix this
  }

  return !error;
}

export async function unlikeActivity(
  userId: string,
  activityId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('likes')
    .delete()
    .eq('user_id', userId)
    .eq('review_id', activityId);

  return !error;
}

export async function getActivityLikes(
  activityId: string,
  currentUserId?: string
): Promise<{ count: number; likedByUser: boolean }> {
  const { count, error } = await supabase
    .from('likes')
    .select('id', { count: 'exact', head: true })
    .eq('review_id', activityId);

  if (error) {
    return { count: 0, likedByUser: false };
  }

  let likedByUser = false;
  if (currentUserId) {
    const { data } = await supabase
      .from('likes')
      .select('id')
      .eq('review_id', activityId)
      .eq('user_id', currentUserId)
      .maybeSingle();
    likedByUser = !!data;
  }

  return { count: count || 0, likedByUser };
}

export async function toggleActivityLike(
  userId: string,
  activityId: string,
  isCurrentlyLiked: boolean
): Promise<boolean> {
  if (isCurrentlyLiked) {
    return unlikeActivity(userId, activityId);
  } else {
    return likeActivity(userId, activityId);
  }
}

export async function getActivityCommentCount(activityId: string): Promise<number> {
  const { count, error } = await supabase
    .from('comments')
    .select('id', { count: 'exact', head: true })
    .eq('review_id', activityId);

  if (error) return 0;
  return count || 0;
}

export async function getActivityComments(activityId: string): Promise<Comment[]> {
  const { data, error } = await supabase
    .from('comments')
    .select(`
      *,
      user:users!comments_user_id_fkey (id, username, display_name, profile_image_url)
    `)
    .eq('review_id', activityId)
    .order('created_at', { ascending: true });

  if (error || !data) {
    console.error('Error fetching activity comments:', error);
    return [];
  }

  return data as Comment[];
}

export async function addActivityComment(
  userId: string,
  activityId: string,
  content: string
): Promise<Comment | null> {
  const { data, error } = await supabase
    .from('comments')
    .insert({
      user_id: userId,
      review_id: activityId,
      content: content.trim(),
    })
    .select(`
      *,
      user:users!comments_user_id_fkey (id, username, display_name, profile_image_url)
    `)
    .single();

  if (error || !data) {
    console.error('Error adding activity comment:', error);
    return null;
  }

  // New comments start with 0 likes
  return { ...data, like_count: 0, liked_by_user: false } as Comment;
}

// ============ COMMENT LIKES ============

export async function likeComment(
  userId: string,
  commentId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('comment_likes')
    .insert({ user_id: userId, comment_id: commentId });

  if (error) {
    console.error('Error liking comment:', error);
  }

  return !error;
}

export async function unlikeComment(
  userId: string,
  commentId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('comment_likes')
    .delete()
    .eq('user_id', userId)
    .eq('comment_id', commentId);

  return !error;
}

export async function toggleCommentLike(
  userId: string,
  commentId: string,
  isCurrentlyLiked: boolean
): Promise<boolean> {
  if (isCurrentlyLiked) {
    return unlikeComment(userId, commentId);
  } else {
    return likeComment(userId, commentId);
  }
}

export async function getCommentLikeCount(commentId: string): Promise<number> {
  const { count, error } = await supabase
    .from('comment_likes')
    .select('id', { count: 'exact', head: true })
    .eq('comment_id', commentId);

  if (error) return 0;
  return count || 0;
}

export async function getActivityCommentsWithLikes(
  activityId: string,
  currentUserId?: string
): Promise<Comment[]> {
  // Fetch comments
  const { data: commentsData, error: commentsError } = await supabase
    .from('comments')
    .select(`
      *,
      user:users!comments_user_id_fkey (id, username, display_name, profile_image_url)
    `)
    .eq('review_id', activityId)
    .order('created_at', { ascending: true });

  if (commentsError || !commentsData) {
    console.error('Error fetching activity comments:', commentsError);
    return [];
  }

  if (commentsData.length === 0) {
    return [];
  }

  const commentIds = commentsData.map(c => c.id);

  // Fetch like counts for all comments
  const { data: likeCounts } = await supabase
    .from('comment_likes')
    .select('comment_id')
    .in('comment_id', commentIds);

  // Count likes per comment
  const likeCountMap = new Map<string, number>();
  for (const like of likeCounts || []) {
    likeCountMap.set(like.comment_id, (likeCountMap.get(like.comment_id) || 0) + 1);
  }

  // Check which comments current user has liked
  let userLikedSet = new Set<string>();
  if (currentUserId) {
    const { data: userLikes } = await supabase
      .from('comment_likes')
      .select('comment_id')
      .eq('user_id', currentUserId)
      .in('comment_id', commentIds);

    userLikedSet = new Set((userLikes || []).map(l => l.comment_id));
  }

  // Merge like data into comments
  return commentsData.map(comment => ({
    ...comment,
    like_count: likeCountMap.get(comment.id) || 0,
    liked_by_user: userLikedSet.has(comment.id),
  })) as Comment[];
}

// ============ FRIENDS' REVIEWS ============

export interface FriendReview extends Review {
  users: Pick<User, 'id' | 'username' | 'display_name' | 'profile_image_url'>;
  watchDates?: WatchHistoryEntry[];
}

export async function getFriendsReviewsForMovie(
  currentUserId: string,
  movieId: number
): Promise<FriendReview[]> {
  // Get users that current user follows
  const { data: followsData, error: followsError } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', currentUserId);

  if (followsError || !followsData || followsData.length === 0) {
    return [];
  }

  const followingIds = followsData.map((f) => f.following_id);

  // First, get the content_id for this TMDB movie
  const { data: contentData } = await supabase
    .from('content')
    .select('id')
    .eq('tmdb_id', movieId)
    .eq('content_type', 'movie')
    .single();

  if (!contentData) {
    return []; // Movie not in content table yet
  }

  // Query activity_log for completed activities from followed users
  const { data: activitiesData, error: activitiesError } = await supabase
    .from('activity_log')
    .select(`
      id,
      user_id,
      content_id,
      star_rating,
      review_text,
      watch_date,
      tagged_friends,
      is_private,
      created_at,
      user:user_id (
        id,
        username,
        display_name,
        profile_image_url
      )
    `)
    .eq('content_id', contentData.id)
    .eq('status', 'completed')
    .eq('is_private', false)
    .in('user_id', followingIds)
    .order('created_at', { ascending: false });

  if (activitiesError || !activitiesData) {
    return [];
  }

  // Batch fetch all watch dates in a single query
  const userIds = activitiesData.map((a) => a.user_id);
  const { data: allWatchDates } = await supabase
    .from('watch_history')
    .select('*')
    .in('user_id', userIds)
    .eq('movie_id', movieId)
    .order('watched_at', { ascending: false });

  // Create lookup map: user_id -> watch dates
  const watchDatesMap = new Map<string, WatchHistoryEntry[]>();
  for (const wd of allWatchDates || []) {
    const existing = watchDatesMap.get(wd.user_id) || [];
    existing.push(wd);
    watchDatesMap.set(wd.user_id, existing);
  }

  // Transform activities to FriendReview format
  const reviewsWithDates = activitiesData.map((activity) => ({
    id: activity.id,
    user_id: activity.user_id,
    movie_id: movieId,
    star_rating: activity.star_rating,
    review_text: activity.review_text,
    watch_date: activity.watch_date,
    tagged_friends: activity.tagged_friends,
    is_private: activity.is_private,
    created_at: activity.created_at,
    users: activity.user,
    watchDates: watchDatesMap.get(activity.user_id) || [],
  })) as FriendReview[];

  return reviewsWithDates;
}
