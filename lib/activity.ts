import { supabase } from './supabase';
import { Activity, ActivityStatus, Content, ContentType } from '@/types';
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

  const activityData = {
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
      content:content_id (*)
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
      content:content_id (*)
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
      content:content_id (*)
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
      content:content_id (*)
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
      content:content_id (*)
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
      content:content_id (*)
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
      user:user_id (id, username, display_name, profile_image_url)
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
      user:user_id (id, username, display_name, profile_image_url)
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
  if (!content) return 0;

  if (content.content_type === 'movie') {
    if (activity.progress_minutes && content.runtime_minutes) {
      return Math.min(100, Math.round((activity.progress_minutes / content.runtime_minutes) * 100));
    }
  } else if (content.content_type === 'tv') {
    if (activity.progress_season && activity.progress_episode && content.total_episodes) {
      // Rough calculation based on total episodes
      // This would need season data for accuracy
      const estimatedWatched = (activity.progress_season - 1) * 10 + activity.progress_episode;
      return Math.min(100, Math.round((estimatedWatched / content.total_episodes) * 100));
    }
  }

  return 0;
}
