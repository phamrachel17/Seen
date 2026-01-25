import { supabase } from './supabase';
import { Movie, Content } from '@/types';
import { discoverMoviesByGenres, GENRE_IDS } from './tmdb';

// Map genre strings to TMDB genre IDs
const GENRE_STRING_TO_ID: Record<string, number> = {
  action: GENRE_IDS.action,
  comedy: GENRE_IDS.comedy,
  drama: GENRE_IDS.drama,
  horror: GENRE_IDS.horror,
  romance: GENRE_IDS.romance,
  'science fiction': GENRE_IDS.scifi,
  thriller: GENRE_IDS.thriller,
  documentary: GENRE_IDS.documentary,
  animation: GENRE_IDS.animation,
  crime: GENRE_IDS.crime,
  mystery: GENRE_IDS.mystery,
  fantasy: GENRE_IDS.fantasy,
};

// Get recommended content based on user's watch history
export async function getRecommendedContent(userId: string): Promise<Movie[]> {
  // 1. Get user's completed activities with content data
  const { data: activities, error } = await supabase
    .from('activity_log')
    .select(`
      content_id,
      content:content_id (
        id,
        tmdb_id,
        genres
      )
    `)
    .eq('user_id', userId)
    .eq('status', 'completed')
    .limit(50);

  if (error || !activities || activities.length === 0) {
    return [];
  }

  // 2. Extract genres and count frequency
  const genreCount = new Map<string, number>();
  const watchedTmdbIds = new Set<number>();

  for (const activity of activities) {
    // Supabase returns content as the joined record
    const content = activity.content as unknown as { id: number; tmdb_id: number; genres?: string[] } | null;
    if (!content) continue;

    watchedTmdbIds.add(content.tmdb_id);

    const genres = content.genres || [];
    for (const genre of genres) {
      const normalizedGenre = genre.toLowerCase();
      genreCount.set(normalizedGenre, (genreCount.get(normalizedGenre) || 0) + 1);
    }
  }

  // 3. Get top 3 genres by frequency
  const sortedGenres = Array.from(genreCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  if (sortedGenres.length === 0) {
    return [];
  }

  // 4. Map genre strings to TMDB IDs
  const genreIds: number[] = [];
  for (const [genre] of sortedGenres) {
    const genreId = GENRE_STRING_TO_ID[genre];
    if (genreId) {
      genreIds.push(genreId);
    }
  }

  if (genreIds.length === 0) {
    return [];
  }

  // 5. Call TMDB discover with those genres
  const recommendations = await discoverMoviesByGenres(genreIds);

  // 6. Filter out content user has already watched
  return recommendations.filter((movie) => !watchedTmdbIds.has(movie.id));
}

// Get user's top genres based on watch history
export async function getUserTopGenres(
  userId: string,
  limit: number = 5
): Promise<{ genre: string; count: number }[]> {
  const { data: activities, error } = await supabase
    .from('activity_log')
    .select(`
      content:content_id (
        genres
      )
    `)
    .eq('user_id', userId)
    .eq('status', 'completed')
    .limit(100);

  if (error || !activities) {
    return [];
  }

  const genreCount = new Map<string, number>();

  for (const activity of activities) {
    const content = activity.content as { genres?: string[] } | null;
    if (!content?.genres) continue;

    for (const genre of content.genres) {
      genreCount.set(genre, (genreCount.get(genre) || 0) + 1);
    }
  }

  return Array.from(genreCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([genre, count]) => ({ genre, count }));
}
