import { supabase } from './supabase';
import { SeasonRating } from '@/types';

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
 */
export async function setSeasonRating(
  userId: string,
  contentId: number,
  seasonNumber: number,
  starRating: number,
  reviewText?: string
): Promise<SeasonRating | null> {
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

  return data;
}

/**
 * Delete a season rating
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
