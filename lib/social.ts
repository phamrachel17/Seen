import { supabase } from './supabase';
import { Comment, Notification, User, Review } from '@/types';

// ============ MOVIE RATINGS ============

export async function getMovieAverageRating(
  movieId: number
): Promise<{ average: number; count: number } | null> {
  const { data, error } = await supabase
    .from('reviews')
    .select('star_rating')
    .eq('movie_id', movieId)
    .eq('is_private', false);

  if (error || !data || data.length === 0) return null;

  const sum = data.reduce((acc, r) => acc + r.star_rating, 0);
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

  return data as Comment;
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
  comment_id?: string;
}

export async function createNotification(
  data: CreateNotificationData
): Promise<void> {
  // Don't create notification if user is notifying themselves
  if (data.user_id === data.actor_id) return;

  const { error } = await supabase.from('notifications').insert(data);

  if (error) {
    console.error('Error creating notification:', error);
  }
}

export async function getNotifications(
  userId: string,
  limit: number = 50
): Promise<Notification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select(`
      *,
      actor:users!notifications_actor_id_fkey (id, username, display_name, profile_image_url),
      review:reviews!notifications_review_id_fkey (
        id,
        movie_id,
        movies (id, title, poster_url)
      )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) {
    console.error('Error fetching notifications:', error);
    return [];
  }

  return data as Notification[];
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

// ============ FRIENDS' REVIEWS ============

export interface FriendReview extends Review {
  users: Pick<User, 'id' | 'username' | 'display_name' | 'profile_image_url'>;
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

  // Get public reviews for this movie from followed users
  const { data: reviewsData, error: reviewsError } = await supabase
    .from('reviews')
    .select(`
      *,
      users!reviews_user_id_fkey (
        id,
        username,
        display_name,
        profile_image_url
      )
    `)
    .eq('movie_id', movieId)
    .eq('is_private', false)
    .in('user_id', followingIds)
    .order('created_at', { ascending: false });

  if (reviewsError || !reviewsData) {
    return [];
  }

  return reviewsData as FriendReview[];
}
