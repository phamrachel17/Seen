import { supabase } from './supabase';
import { User, UserSearchResult, Review, Movie } from '@/types';
import { cache, CACHE_KEYS, TTL } from './cache';
import { createNotification } from './social';

// Search users by username or display_name
export async function searchUsers(
  query: string,
  currentUserId: string,
  limit: number = 20
): Promise<UserSearchResult[]> {
  const searchTerm = query.trim().toLowerCase();

  if (!searchTerm) return [];

  // Search users - partial matches on username and display_name
  const { data: users, error } = await supabase
    .from('users')
    .select('id, username, display_name, profile_image_url')
    .or(`username.ilike.%${searchTerm}%,display_name.ilike.%${searchTerm}%`)
    .neq('id', currentUserId)
    .limit(limit);

  if (error || !users) return [];

  // Sort: exact username matches first
  const sorted = users.sort((a, b) => {
    const aExact = a.username.toLowerCase() === searchTerm;
    const bExact = b.username.toLowerCase() === searchTerm;
    if (aExact && !bExact) return -1;
    if (!aExact && bExact) return 1;
    return 0;
  });

  // Get follow status for all returned users
  const { data: follows } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', currentUserId)
    .in('following_id', sorted.map((u) => u.id));

  const followingSet = new Set(follows?.map((f) => f.following_id) || []);

  return sorted.map((user) => ({
    ...user,
    is_following: followingSet.has(user.id),
  }));
}

// Follow a user
export async function followUser(
  followerId: string,
  followingId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('follows')
    .insert({ follower_id: followerId, following_id: followingId });

  if (!error) {
    // Invalidate caches so new follow is immediately visible
    cache.invalidate(CACHE_KEYS.followingIds(followerId));
    cache.invalidate(CACHE_KEYS.feed(followerId));
    cache.invalidate(CACHE_KEYS.followCounts(followerId));
    cache.invalidate(CACHE_KEYS.followCounts(followingId));

    // Create notification for the followed user
    await createNotification({
      user_id: followingId,
      actor_id: followerId,
      type: 'follow',
    });
  }

  return !error;
}

// Unfollow a user
export async function unfollowUser(
  followerId: string,
  followingId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', followerId)
    .eq('following_id', followingId);

  if (!error) {
    // Invalidate caches so unfollow is immediately visible
    cache.invalidate(CACHE_KEYS.followingIds(followerId));
    cache.invalidate(CACHE_KEYS.feed(followerId));
    cache.invalidate(CACHE_KEYS.followCounts(followerId));
    cache.invalidate(CACHE_KEYS.followCounts(followingId));
  }

  return !error;
}

// Get follow counts for a user (cached for 10 minutes)
export async function getFollowCounts(
  userId: string
): Promise<{ followers: number; following: number }> {
  // Check cache first
  const cacheKey = CACHE_KEYS.followCounts(userId);
  const cached = cache.get<{ followers: number; following: number }>(cacheKey);
  if (cached) return cached;

  const [followersResult, followingResult] = await Promise.all([
    supabase
      .from('follows')
      .select('id', { count: 'exact', head: true })
      .eq('following_id', userId),
    supabase
      .from('follows')
      .select('id', { count: 'exact', head: true })
      .eq('follower_id', userId),
  ]);

  const result = {
    followers: followersResult.count || 0,
    following: followingResult.count || 0,
  };

  // Cache the result
  cache.set(cacheKey, result, TTL.MEDIUM);

  return result;
}

// Get followers list
export async function getFollowers(
  userId: string,
  currentUserId: string
): Promise<UserSearchResult[]> {
  const { data, error } = await supabase
    .from('follows')
    .select(
      `
      follower_id,
      users!follows_follower_id_fkey (
        id, username, display_name, profile_image_url
      )
    `
    )
    .eq('following_id', userId);

  if (error || !data) return [];

  const users = data
    .map((f) => f.users as unknown as User)
    .filter(Boolean);

  if (users.length === 0) return [];

  // Get follow status for current user
  const { data: follows } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', currentUserId)
    .in(
      'following_id',
      users.map((u) => u.id)
    );

  const followingSet = new Set(follows?.map((f) => f.following_id) || []);

  return users.map((user) => ({
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    profile_image_url: user.profile_image_url,
    is_following: followingSet.has(user.id),
  }));
}

// Get following list
export async function getFollowing(
  userId: string,
  currentUserId: string
): Promise<UserSearchResult[]> {
  const { data, error } = await supabase
    .from('follows')
    .select(
      `
      following_id,
      users!follows_following_id_fkey (
        id, username, display_name, profile_image_url
      )
    `
    )
    .eq('follower_id', userId);

  if (error || !data) return [];

  const users = data
    .map((f) => f.users as unknown as User)
    .filter(Boolean);

  if (users.length === 0) return [];

  // Get follow status for current user
  const { data: follows } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', currentUserId)
    .in(
      'following_id',
      users.map((u) => u.id)
    );

  const followingSet = new Set(follows?.map((f) => f.following_id) || []);

  return users.map((user) => ({
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    profile_image_url: user.profile_image_url,
    is_following: followingSet.has(user.id),
  }));
}

// Check if current user follows a specific user
export async function checkIfFollowing(
  followerId: string,
  followingId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('follows')
    .select('id')
    .eq('follower_id', followerId)
    .eq('following_id', followingId)
    .single();

  return !!data;
}

// Get list of user IDs that the current user is following (cached for 10 minutes)
export async function getFollowingIds(userId: string): Promise<string[]> {
  // Check cache first
  const cacheKey = CACHE_KEYS.followingIds(userId);
  const cached = cache.get<string[]>(cacheKey);
  if (cached) return cached;

  const { data, error } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', userId);

  if (error || !data) return [];

  const result = data.map((f) => f.following_id);

  // Cache the result
  cache.set(cacheKey, result, TTL.MEDIUM);

  return result;
}

// Get user profile data
export async function getUserProfile(
  userId: string
): Promise<Pick<User, 'id' | 'username' | 'display_name' | 'bio' | 'profile_image_url'> | null> {
  const { data, error } = await supabase
    .from('users')
    .select('id, username, display_name, bio, profile_image_url')
    .eq('id', userId)
    .single();

  if (error || !data) return null;
  return data;
}

// Get user's ranking position among all users (based on total movies ranked)
// Returns the position (1 = most movies ranked) or null if user has no rankings
// Cached for 1 hour as this is expensive to compute
export async function getUserRankingPosition(userId: string): Promise<number | null> {
  // Check cache first
  const cacheKey = CACHE_KEYS.rankingPosition(userId);
  const cached = cache.get<number | null>(cacheKey);
  if (cached !== null) return cached;

  // Get all users' rankings counts
  const { data: allRankings, error } = await supabase
    .from('rankings')
    .select('user_id');

  if (error || !allRankings) return null;

  // Count rankings per user
  const rankingsCountMap = new Map<string, number>();
  allRankings.forEach((r) => {
    const count = rankingsCountMap.get(r.user_id) || 0;
    rankingsCountMap.set(r.user_id, count + 1);
  });

  // Get the target user's count
  const userCount = rankingsCountMap.get(userId);
  if (!userCount || userCount === 0) return null;

  // Sort all users by count descending and find position
  const sortedCounts = Array.from(rankingsCountMap.entries())
    .sort((a, b) => b[1] - a[1]);

  const position = sortedCounts.findIndex(([id]) => id === userId);
  const result = position >= 0 ? position + 1 : null;

  // Cache the result
  cache.set(cacheKey, result, TTL.VERY_LONG);

  return result;
}

// Get user stats (films, shows, watch time, rankings count) - cached for 30 minutes
export async function getUserStats(userId: string): Promise<{
  totalFilms: number;
  totalShows: number;
  totalMinutes: number;
  rankingsCount: number;
}> {
  // Check cache first
  const cacheKey = CACHE_KEYS.userStats(userId);
  const cached = cache.get<{ totalFilms: number; totalShows: number; totalMinutes: number; rankingsCount: number }>(cacheKey);
  if (cached) return cached;

  const [activitiesResult, rankingsResult] = await Promise.all([
    supabase
      .from('activity_log')
      .select(
        `
        id,
        content_id,
        content:content_id (
          id,
          content_type,
          runtime_minutes,
          total_episodes,
          episode_runtime
        )
      `
      )
      .eq('user_id', userId)
      .eq('status', 'completed'),
    supabase
      .from('rankings')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId),
  ]);

  const activities = activitiesResult.data || [];

  // Deduplicate by content_id - only count each title once
  const uniqueContentMap = new Map<number, any>();
  for (const activity of activities) {
    if (!uniqueContentMap.has(activity.content_id)) {
      uniqueContentMap.set(activity.content_id, activity);
    }
  }

  // Count films and shows separately, and calculate watch time
  let totalFilms = 0;
  let totalShows = 0;
  let totalMinutes = 0;

  for (const activity of uniqueContentMap.values()) {
    const content = activity.content as {
      content_type: string;
      runtime_minutes?: number;
      total_episodes?: number;
      episode_runtime?: number;
    } | null;

    if (!content) continue;

    // Count by content type
    if (content.content_type === 'movie') {
      totalFilms++;
      totalMinutes += content.runtime_minutes || 0;
    } else if (content.content_type === 'tv') {
      totalShows++;
      // For TV shows: use runtime_minutes if available, otherwise calculate
      if (content.runtime_minutes) {
        totalMinutes += content.runtime_minutes;
      } else if (content.total_episodes && content.episode_runtime) {
        totalMinutes += content.total_episodes * content.episode_runtime;
      }
    }
  }

  const result = {
    totalFilms,
    totalShows,
    totalMinutes,
    rankingsCount: rankingsResult.count || 0,
  };

  // Cache the result
  cache.set(cacheKey, result, TTL.LONG);

  return result;
}

// Get user's recent reviews (public only for other users)
interface ReviewWithMovie extends Review {
  movies: Movie;
}

// Get top users ranked by total rankings (movies + TV shows) in descending order
export async function getTopRankedUsers(
  currentUserId: string,
  limit: number = 50,
  includeCurrentUser: boolean = false
): Promise<(UserSearchResult & { rankings_count: number })[]> {
  // Get all users with their rankings count
  let query = supabase
    .from('users')
    .select('id, username, display_name, profile_image_url');

  // Optionally exclude current user
  if (!includeCurrentUser) {
    query = query.neq('id', currentUserId);
  }

  const { data: users, error } = await query;

  if (error || !users || users.length === 0) return [];

  // Get rankings count for each user
  const userIds = users.map((u) => u.id);
  const { data: rankings } = await supabase
    .from('rankings')
    .select('user_id')
    .in('user_id', userIds);

  // Count rankings per user
  const rankingsCountMap = new Map<string, number>();
  rankings?.forEach((r) => {
    const count = rankingsCountMap.get(r.user_id) || 0;
    rankingsCountMap.set(r.user_id, count + 1);
  });

  // Sort users by rankings count (descending)
  const sortedUsers = users
    .map((user) => ({
      ...user,
      rankings_count: rankingsCountMap.get(user.id) || 0,
    }))
    .sort((a, b) => b.rankings_count - a.rankings_count)
    .slice(0, limit);

  // Get follow status for all returned users (excluding current user from follow check)
  const otherUserIds = sortedUsers
    .filter((u) => u.id !== currentUserId)
    .map((u) => u.id);

  const followingSet = new Set<string>();
  if (otherUserIds.length > 0) {
    const { data: follows } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', currentUserId)
      .in('following_id', otherUserIds);

    follows?.forEach((f) => followingSet.add(f.following_id));
  }

  return sortedUsers.map((user) => ({
    ...user,
    is_following: followingSet.has(user.id),
  }));
}

export async function getUserRecentReviews(
  userId: string,
  currentUserId: string,
  limit: number = 6
): Promise<ReviewWithMovie[]> {
  // If viewing own profile, show all reviews
  // If viewing someone else's profile, only show public reviews
  const isOwnProfile = userId === currentUserId;

  let query = supabase
    .from('reviews')
    .select(
      `
      *,
      movies (*)
    `
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!isOwnProfile) {
    query = query.eq('is_private', false);
  }

  const { data, error } = await query;

  if (error || !data) return [];

  return data.filter((item) => item.movies) as ReviewWithMovie[];
}
