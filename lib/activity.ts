import { supabase } from './supabase';
import { Activity, ActivityStatus, Content, ContentType, Watch, WatchStatus, WatchWithActivities } from '@/types';
import { ensureContentExists } from './content';

export interface CreateActivityParams {
  userId: string;
  tmdbId: number;
  contentType: ContentType;
  status: ActivityStatus;
  // Completed activity fields
  starRating?: number;
  reviewText?: string;
  // In Progress activity fields
  note?: string;
  progressMinutes?: number;
  progressSeason?: number;
  progressEpisode?: number;
  // Common fields
  watchDate?: Date;
  taggedFriends?: string[];
  isPrivate?: boolean;
  ratedSeason?: number;
  // Watch association (for in_progress activities)
  watchId?: string;
}

export interface UpdateActivityParams {
  activityId: string;
  status?: ActivityStatus;
  starRating?: number;
  reviewText?: string;
  note?: string;
  progressMinutes?: number;
  progressSeason?: number;
  progressEpisode?: number;
  watchDate?: Date;
  taggedFriends?: string[];
  isPrivate?: boolean;
  ratedSeason?: number;
}

// Create a new activity log entry
export async function createActivity(params: CreateActivityParams): Promise<Activity | null> {
  // First ensure content exists in database
  const content = await ensureContentExists(params.tmdbId, params.contentType);
  if (!content) {
    console.error('Failed to ensure content exists');
    return null;
  }

  // For in_progress activities, ensure we have a watch to link to
  let watchId = params.watchId;
  if (params.status === 'in_progress' && !watchId) {
    const watch = await getOrCreateActiveWatch(params.userId, content.id);
    watchId = watch?.id;
  }

  const activityData: Record<string, any> = {
    user_id: params.userId,
    content_id: content.id,
    status: params.status,
    star_rating: params.starRating,
    review_text: params.reviewText,
    note: params.note,
    progress_minutes: params.progressMinutes,
    progress_season: params.progressSeason,
    progress_episode: params.progressEpisode,
    watch_date: params.watchDate?.toISOString().split('T')[0],
    tagged_friends: params.taggedFriends,
    is_private: params.isPrivate ?? false,
    rated_season: params.ratedSeason,
  };

  // Link to watch if available
  if (watchId) {
    activityData.watch_id = watchId;
  }

  const { data, error } = await supabase
    .from('activity_log')
    .insert(activityData)
    .select(`
      *,
      content:content_id (*)
    `)
    .single();

  if (error) {
    // Check for unique constraint violation (only applies to completed activities)
    // Error code 23505 is PostgreSQL's unique_violation error
    if (error.code === '23505' && params.status === 'completed') {
      console.warn('Completed activity already exists, fetching existing...');
      // Return the existing completed activity instead of failing
      return getUserCompletedActivity(params.userId, content.id, params.ratedSeason);
    }
    console.error('Error creating activity:', error);
    return null;
  }

  // Auto-complete watch if progress reaches 100%
  if (params.status === 'in_progress' && watchId) {
    let isComplete = false;

    if (content.content_type === 'movie') {
      // Movie: check if progress_minutes >= runtime
      if (params.progressMinutes && content.runtime_minutes) {
        isComplete = params.progressMinutes >= content.runtime_minutes;
      }
    } else if (content.content_type === 'tv') {
      // TV: complete when user reaches final season
      if (params.progressSeason && content.total_seasons) {
        isComplete = params.progressSeason >= content.total_seasons;
      }
    }

    if (isComplete) {
      await completeWatch(watchId);
    }
  }

  return transformActivity(data);
}

// Update an existing activity
export async function updateActivity(params: UpdateActivityParams): Promise<Activity | null> {
  const updateData: Record<string, any> = {};

  if (params.status !== undefined) updateData.status = params.status;
  if (params.starRating !== undefined) updateData.star_rating = params.starRating;
  if (params.reviewText !== undefined) updateData.review_text = params.reviewText;
  if (params.note !== undefined) updateData.note = params.note;
  if (params.progressMinutes !== undefined) updateData.progress_minutes = params.progressMinutes;
  if (params.progressSeason !== undefined) updateData.progress_season = params.progressSeason;
  if (params.progressEpisode !== undefined) updateData.progress_episode = params.progressEpisode;
  if (params.watchDate !== undefined) updateData.watch_date = params.watchDate.toISOString().split('T')[0];
  if (params.taggedFriends !== undefined) updateData.tagged_friends = params.taggedFriends;
  if (params.isPrivate !== undefined) updateData.is_private = params.isPrivate;
  if (params.ratedSeason !== undefined) updateData.rated_season = params.ratedSeason;

  const { data, error } = await supabase
    .from('activity_log')
    .update(updateData)
    .eq('id', params.activityId)
    .select(`
      *,
      content:content_id (*)
    `)
    .single();

  if (error) {
    console.error('Error updating activity:', error);
    return null;
  }

  return transformActivity(data);
}

// Delete an activity
export async function deleteActivity(activityId: string): Promise<boolean> {
  const { error } = await supabase
    .from('activity_log')
    .delete()
    .eq('id', activityId);

  if (error) {
    console.error('Error deleting activity:', error);
    return false;
  }

  return true;
}

// Get activity by ID
export async function getActivityById(activityId: string): Promise<Activity | null> {
  const { data, error } = await supabase
    .from('activity_log')
    .select(`
      *,
      content:content_id (*),
      user:user_id (id, username, display_name, profile_image_url),
      watch:watch_id (*)
    `)
    .eq('id', activityId)
    .single();

  if (error) {
    console.error('Error fetching activity:', error);
    return null;
  }

  return transformActivity(data);
}

// Get user's activities for a specific content item
export async function getUserActivitiesForContent(
  userId: string,
  contentId: number
): Promise<Activity[]> {
  const { data, error } = await supabase
    .from('activity_log')
    .select(`
      *,
      content:content_id (*),
      watch:watch_id (*)
    `)
    .eq('user_id', userId)
    .eq('content_id', contentId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching user activities for content:', error);
    return [];
  }

  return data?.map(transformActivity) || [];
}

// Get user's latest activity for a content item (any status)
export async function getUserLatestActivityForContent(
  userId: string,
  contentId: number
): Promise<Activity | null> {
  const { data, error } = await supabase
    .from('activity_log')
    .select(`
      *,
      content:content_id (*),
      watch:watch_id (*)
    `)
    .eq('user_id', userId)
    .eq('content_id', contentId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching latest activity:', error);
    return null;
  }

  return data ? transformActivity(data) : null;
}

// Get user's completed activity for content (the "review")
export async function getUserCompletedActivity(
  userId: string,
  contentId: number,
  ratedSeason?: number
): Promise<Activity | null> {
  let query = supabase
    .from('activity_log')
    .select(`
      *,
      content:content_id (*),
      watch:watch_id (*)
    `)
    .eq('user_id', userId)
    .eq('content_id', contentId)
    .eq('status', 'completed');

  if (ratedSeason !== undefined) {
    query = query.eq('rated_season', ratedSeason);
  } else {
    query = query.is('rated_season', null);
  }

  const { data, error } = await query.order('created_at', { ascending: false }).limit(1).single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching completed activity:', error);
    return null;
  }

  return data ? transformActivity(data) : null;
}

// Get user's in-progress activity for content
export async function getUserInProgressActivity(
  userId: string,
  contentId: number
): Promise<Activity | null> {
  const { data, error } = await supabase
    .from('activity_log')
    .select(`
      *,
      content:content_id (*),
      watch:watch_id (*)
    `)
    .eq('user_id', userId)
    .eq('content_id', contentId)
    .eq('status', 'in_progress')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching in-progress activity:', error);
    return null;
  }

  return data ? transformActivity(data) : null;
}

// Get user's all activities (for profile)
export async function getUserActivities(
  userId: string,
  status?: ActivityStatus,
  limit?: number
): Promise<Activity[]> {
  let query = supabase
    .from('activity_log')
    .select(`
      *,
      content:content_id (*),
      watch:watch_id (*)
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  if (limit) {
    query = query.limit(limit);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching user activities:', error);
    return [];
  }

  return data?.map(transformActivity) || [];
}

// Get friends' activities for feed
export async function getFeedActivities(
  userId: string,
  followingIds: string[],
  limit: number = 20,
  offset: number = 0
): Promise<Activity[]> {
  if (followingIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('activity_log')
    .select(`
      *,
      content:content_id (*),
      user:user_id (id, username, display_name, profile_image_url),
      watch:watch_id (*)
    `)
    .in('user_id', followingIds)
    .eq('is_private', false)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('Error fetching feed activities:', error);
    return [];
  }

  return data?.map(transformActivity) || [];
}

// Get friends' activities for a specific content item
export async function getFriendsActivitiesForContent(
  userId: string,
  contentId: number,
  followingIds: string[]
): Promise<Activity[]> {
  if (followingIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('activity_log')
    .select(`
      *,
      content:content_id (*),
      user:user_id (id, username, display_name, profile_image_url),
      watch:watch_id (*)
    `)
    .eq('content_id', contentId)
    .in('user_id', followingIds)
    .eq('is_private', false)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching friends activities for content:', error);
    return [];
  }

  return data?.map(transformActivity) || [];
}

// Transform database row to Activity type
function transformActivity(data: any): Activity {
  return {
    id: data.id,
    user_id: data.user_id,
    content_id: data.content_id,
    status: data.status,
    watch_id: data.watch_id,
    star_rating: data.star_rating,
    review_text: data.review_text,
    note: data.note,
    progress_minutes: data.progress_minutes,
    progress_season: data.progress_season,
    progress_episode: data.progress_episode,
    watch_date: data.watch_date,
    tagged_friends: data.tagged_friends,
    is_private: data.is_private,
    rated_season: data.rated_season,
    created_at: data.created_at,
    content: data.content,
    user: data.user,
    watch: data.watch,
  };
}

// Format progress for display
export function formatProgress(activity: Activity): string {
  if (activity.status !== 'in_progress') return '';

  const content = activity.content;
  if (!content) return '';

  if (content.content_type === 'movie') {
    if (activity.progress_minutes) {
      const total = content.runtime_minutes || 0;
      if (total > 0) {
        const percent = Math.round((activity.progress_minutes / total) * 100);
        return `${activity.progress_minutes} min (${percent}%)`;
      }
      return `${activity.progress_minutes} min`;
    }
  } else if (content.content_type === 'tv') {
    if (activity.progress_season && activity.progress_episode) {
      return `S${activity.progress_season} E${activity.progress_episode}`;
    }
  }

  return '';
}

// Calculate progress percentage
export function getProgressPercent(activity: Activity): number {
  if (activity.status !== 'in_progress') return 0;

  const content = activity.content;
  if (!content) return 1; // Has in_progress status but no content - still show it

  if (content.content_type === 'movie') {
    if (activity.progress_minutes && content.runtime_minutes) {
      return Math.min(99, Math.round((activity.progress_minutes / content.runtime_minutes) * 100));
    }
    // Movie is in_progress but no specific progress data - return 1%
    return 1;
  } else if (content.content_type === 'tv') {
    // For TV shows with episode progress
    if (activity.progress_season && activity.progress_episode) {
      // If we have total_episodes, calculate percentage
      if (content.total_episodes && content.total_episodes > 0) {
        const estimatedWatched = (activity.progress_season - 1) * 10 + activity.progress_episode;
        // Use Math.max(1, ...) to ensure at least 1% for any episode progress
        return Math.min(99, Math.max(1, Math.round((estimatedWatched / content.total_episodes) * 100)));
      }
      // No total_episodes data - return 1% to ensure it appears in Currently Watching
      return 1;
    }
    // TV show is in_progress but no episode data - return 1%
    return 1;
  }

  // Fallback for any in_progress activity
  return 1;
}

// Check if activity is truly in progress (< 100%)
export function isActivityInProgress(activity: Activity): boolean {
  if (activity.status !== 'in_progress') return false;
  const percent = getProgressPercent(activity);
  return percent > 0 && percent < 100;
}

// ============================================
// WATCH FUNCTIONS
// ============================================

// Transform database row to Watch type
function transformWatch(data: any): Watch {
  return {
    id: data.id,
    user_id: data.user_id,
    content_id: data.content_id,
    watch_number: data.watch_number,
    status: data.status,
    started_at: data.started_at,
    completed_at: data.completed_at,
    created_at: data.created_at,
    content: data.content,
    activities: data.activities?.map(transformActivity),
  };
}

// Get user's current active (in_progress) watch for content
export async function getActiveWatch(
  userId: string,
  contentId: number
): Promise<Watch | null> {
  const { data, error } = await supabase
    .from('watches')
    .select(`
      *,
      content:content_id (*)
    `)
    .eq('user_id', userId)
    .eq('content_id', contentId)
    .eq('status', 'in_progress')
    .order('watch_number', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching active watch:', error);
    return null;
  }

  return data ? transformWatch(data) : null;
}

// Get watch count for a user's content (for determining next watch number)
export async function getWatchCount(
  userId: string,
  contentId: number
): Promise<number> {
  const { count, error } = await supabase
    .from('watches')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('content_id', contentId);

  if (error) {
    console.error('Error getting watch count:', error);
    return 0;
  }

  return count || 0;
}

// Start a new watch for content
export async function startNewWatch(
  userId: string,
  contentId: number
): Promise<Watch | null> {
  const watchCount = await getWatchCount(userId, contentId);
  const watchNumber = watchCount + 1;

  const { data, error } = await supabase
    .from('watches')
    .insert({
      user_id: userId,
      content_id: contentId,
      watch_number: watchNumber,
      status: 'in_progress',
    })
    .select(`
      *,
      content:content_id (*)
    `)
    .single();

  if (error) {
    console.error('Error starting new watch:', error);
    return null;
  }

  return transformWatch(data);
}

// Get or create an active watch for content
// If an in_progress watch exists, return it; otherwise create a new one
export async function getOrCreateActiveWatch(
  userId: string,
  contentId: number
): Promise<Watch | null> {
  const activeWatch = await getActiveWatch(userId, contentId);
  if (activeWatch) {
    return activeWatch;
  }
  return startNewWatch(userId, contentId);
}

// Complete a watch (mark as completed)
export async function completeWatch(watchId: string): Promise<Watch | null> {
  const { data, error } = await supabase
    .from('watches')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', watchId)
    .select(`
      *,
      content:content_id (*)
    `)
    .single();

  if (error) {
    console.error('Error completing watch:', error);
    return null;
  }

  return transformWatch(data);
}

// Abandon a watch (for starting a new rewatch)
export async function abandonWatch(watchId: string): Promise<Watch | null> {
  const { data, error } = await supabase
    .from('watches')
    .update({
      status: 'abandoned',
    })
    .eq('id', watchId)
    .select(`
      *,
      content:content_id (*)
    `)
    .single();

  if (error) {
    console.error('Error abandoning watch:', error);
    return null;
  }

  return transformWatch(data);
}

// Get all watches for a user's content with their activities (for activity history)
export async function getWatchesForContent(
  userId: string,
  contentId: number
): Promise<WatchWithActivities[]> {
  // First get all watches for this content
  const { data: watches, error: watchError } = await supabase
    .from('watches')
    .select(`
      *,
      content:content_id (*)
    `)
    .eq('user_id', userId)
    .eq('content_id', contentId)
    .order('watch_number', { ascending: false });

  if (watchError) {
    console.error('Error fetching watches:', watchError);
    return [];
  }

  if (!watches || watches.length === 0) {
    return [];
  }

  // Get all activities for this user and content
  const { data: activities, error: activityError } = await supabase
    .from('activity_log')
    .select(`
      *,
      content:content_id (*)
    `)
    .eq('user_id', userId)
    .eq('content_id', contentId)
    .order('created_at', { ascending: false });

  if (activityError) {
    console.error('Error fetching activities for watches:', activityError);
    return [];
  }

  // Group activities by watch_id
  const activitiesByWatch = new Map<string, Activity[]>();
  const unlinkedActivities: Activity[] = [];

  for (const activity of activities || []) {
    const transformed = transformActivity(activity);
    if (activity.watch_id) {
      const existing = activitiesByWatch.get(activity.watch_id) || [];
      existing.push(transformed);
      activitiesByWatch.set(activity.watch_id, existing);
    } else {
      unlinkedActivities.push(transformed);
    }
  }

  // Build WatchWithActivities for each watch
  const result: WatchWithActivities[] = watches.map((watch) => {
    const watchActivities = activitiesByWatch.get(watch.id) || [];
    const latestActivity = watchActivities[0];

    return {
      ...transformWatch(watch),
      activities: watchActivities,
      latestProgress: latestActivity ? formatProgress(latestActivity) : undefined,
      progressPercent: latestActivity ? getProgressPercent(latestActivity) : undefined,
    };
  });

  // If there are unlinked activities (from before migration), create a virtual "Watch #0"
  // to display them (edge case for legacy data)
  if (unlinkedActivities.length > 0) {
    const legacyWatch: WatchWithActivities = {
      id: 'legacy',
      user_id: userId,
      content_id: contentId,
      watch_number: 0,
      status: 'completed',
      started_at: unlinkedActivities[unlinkedActivities.length - 1]?.created_at || '',
      created_at: unlinkedActivities[unlinkedActivities.length - 1]?.created_at || '',
      activities: unlinkedActivities,
      latestProgress: unlinkedActivities[0] ? formatProgress(unlinkedActivities[0]) : undefined,
      progressPercent: unlinkedActivities[0] ? getProgressPercent(unlinkedActivities[0]) : undefined,
    };
    result.push(legacyWatch);
  }

  return result;
}

// Get a specific watch by ID
export async function getWatchById(watchId: string): Promise<Watch | null> {
  const { data, error } = await supabase
    .from('watches')
    .select(`
      *,
      content:content_id (*)
    `)
    .eq('id', watchId)
    .single();

  if (error) {
    console.error('Error fetching watch:', error);
    return null;
  }

  return transformWatch(data);
}

// Get user's activity feed (for user activity screen)
export async function getUserActivitiesFeed(
  userId: string,
  viewerId: string | undefined,
  limit: number = 50,
  offset: number = 0
): Promise<Activity[]> {
  const isOwnProfile = userId === viewerId;

  let query = supabase
    .from('activity_log')
    .select(`
      *,
      content:content_id (*),
      user:user_id (id, username, display_name, profile_image_url),
      watch:watch_id (*)
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  // Hide private activities when viewing someone else's profile
  if (!isOwnProfile) {
    query = query.eq('is_private', false);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching user activities feed:', error);
    return [];
  }

  return data?.map(transformActivity) || [];
}

// Get latest activity for a watch
export async function getLatestActivityForWatch(watchId: string): Promise<Activity | null> {
  const { data, error } = await supabase
    .from('activity_log')
    .select(`
      *,
      content:content_id (*)
    `)
    .eq('watch_id', watchId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching latest activity for watch:', error);
    return null;
  }

  return data ? transformActivity(data) : null;
}
