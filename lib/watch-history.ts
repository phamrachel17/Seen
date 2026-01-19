import { supabase } from './supabase';
import { WatchHistoryEntry } from '@/types';

export async function getWatchDates(
  userId: string,
  movieId: number
): Promise<WatchHistoryEntry[]> {
  const { data, error } = await supabase
    .from('watch_history')
    .select('*')
    .eq('user_id', userId)
    .eq('movie_id', movieId)
    .order('watched_at', { ascending: false });

  if (error) {
    console.error('Error fetching watch dates:', error);
    return [];
  }

  return data || [];
}

export async function addWatchDate(
  userId: string,
  movieId: number,
  watchedAt: Date
): Promise<{ error: Error | null }> {
  const dateString = watchedAt.toISOString().split('T')[0]; // YYYY-MM-DD

  const { error } = await supabase
    .from('watch_history')
    .insert({
      user_id: userId,
      movie_id: movieId,
      watched_at: dateString,
    });

  if (error) {
    // Duplicate date error is OK (unique constraint)
    if (error.code === '23505') {
      return { error: null };
    }
    return { error: new Error(error.message) };
  }

  return { error: null };
}

export async function removeWatchDate(
  watchHistoryId: string
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('watch_history')
    .delete()
    .eq('id', watchHistoryId);

  if (error) {
    return { error: new Error(error.message) };
  }

  return { error: null };
}

export async function saveWatchDates(
  userId: string,
  movieId: number,
  dates: Date[]
): Promise<{ error: Error | null }> {
  // Insert all dates (duplicates ignored by unique constraint)
  for (const date of dates) {
    const { error } = await addWatchDate(userId, movieId, date);
    if (error) {
      return { error };
    }
  }

  return { error: null };
}
