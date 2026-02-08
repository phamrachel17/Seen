import { supabase } from './supabase';
import { SeasonRating, Content } from '@/types';

/**
 * Get content record by ID (needed for activity creation)
 */
async function getContentById(contentId: number): Promise<Content | null> {
  const { data, error } = await supabase
    .from('content')
    .select('*')
    .eq('id', contentId)
    .single();

  if (error) {
    console.error('Error fetching content:', error);
    return null;
  }

  return data;
}

/**
 * Get all season ratings for a user's TV show
 */
export async function getSeasonRatings(
  userId: string,
  contentId: number
): Promise<SeasonRating[]> {
  const { data, error } = await supabase
    .from('season_ratings')
    .select('*')
    .eq('user_id', userId)
    .eq('content_id', contentId)
    .order('season_number', { ascending: true });

  if (error) {
    console.error('Error fetching season ratings:', error);
    return [];
  }

  return data || [];
}

/**
 * Get a specific season rating
 */
export async function getSeasonRating(
  userId: string,
  contentId: number,
  seasonNumber: number
): Promise<SeasonRating | null> {
  const { data, error } = await supabase
    .from('season_ratings')
    .select('*')
    .eq('user_id', userId)
    .eq('content_id', contentId)
    .eq('season_number', seasonNumber)
    .maybeSingle();

  if (error) {
    console.error('Error fetching season rating:', error);
    return null;
  }

  return data;
}

/**
 * Set or update a season rating (upsert)
 * Also creates/updates an activity log entry so season ratings appear in the feed
 */
export async function setSeasonRating(
  userId: string,
  contentId: number,
  seasonNumber: number,
  starRating: number,
  reviewText?: string
): Promise<SeasonRating | null> {
  // Save the season rating
  const { data, error } = await supabase
    .from('season_ratings')
    .upsert(
      {
        user_id: userId,
        content_id: contentId,
        season_number: seasonNumber,
        star_rating: starRating,
        review_text: reviewText || null,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'user_id,content_id,season_number',
      }
    )
    .select()
    .single();

  if (error) {
    console.error('Error setting season rating:', error);
    return null;
  }

  // Create/update activity log entry for feed visibility
  try {
    const content = await getContentById(contentId);
    if (content) {
      // Check if activity already exists for this season rating
      const { data: existingActivity } = await supabase
        .from('activity_log')
        .select('id')
        .eq('user_id', userId)
        .eq('content_id', contentId)
        .eq('status', 'completed')
        .eq('rated_season', seasonNumber)
        .maybeSingle();

      if (existingActivity) {
        // Update existing activity
        await supabase
          .from('activity_log')
          .update({
            star_rating: starRating,
            review_text: reviewText || null,
          })
          .eq('id', existingActivity.id);
      } else {
        // Create new activity for the season rating
        await supabase
          .from('activity_log')
          .insert({
            user_id: userId,
            content_id: contentId,
            status: 'completed',
            star_rating: starRating,
            review_text: reviewText || null,
            rated_season: seasonNumber,
            is_private: false,
          });
      }
    }
  } catch (activityError) {
    // Don't fail the season rating save if activity creation fails
    console.error('Error creating activity for season rating:', activityError);
  }

  return data;
}

/**
 * Delete a season rating
 * Also removes the corresponding activity log entry
 */
export async function deleteSeasonRating(
  userId: string,
  contentId: number,
  seasonNumber: number
): Promise<boolean> {
  const { error } = await supabase
    .from('season_ratings')
    .delete()
    .eq('user_id', userId)
    .eq('content_id', contentId)
    .eq('season_number', seasonNumber);

  if (error) {
    console.error('Error deleting season rating:', error);
    return false;
  }

  // Also delete the corresponding activity
  try {
    await supabase
      .from('activity_log')
      .delete()
      .eq('user_id', userId)
      .eq('content_id', contentId)
      .eq('status', 'completed')
      .eq('rated_season', seasonNumber);
  } catch (activityError) {
    console.error('Error deleting activity for season rating:', activityError);
  }

  return true;
}

/**
 * Get average rating across all rated seasons for a show
 */
export async function getAverageSeasonRating(
  userId: string,
  contentId: number
): Promise<number | null> {
  const ratings = await getSeasonRatings(userId, contentId);

  if (ratings.length === 0) return null;

  const sum = ratings.reduce((acc, r) => acc + r.star_rating, 0);
  return sum / ratings.length;
}
