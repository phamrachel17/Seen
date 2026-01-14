import { supabase } from './supabase';
import { Movie, Ranking } from '@/types';

// Represents a comparison needed during ranking
export interface Comparison {
  movieA: Movie;
  movieB: Movie;
  currentIndex: number;
  totalComparisons: number;
}

// State for the binary insertion sort process
export interface RankingState {
  newMovie: Movie;
  rankedMovies: (Movie & { ranking: Ranking })[];
  low: number;
  high: number;
  mid: number;
  comparisons: number;
  maxComparisons: number;
  isComplete: boolean;
  finalPosition: number;
}

/**
 * Get user's ranked movies sorted by position
 */
export async function getUserRankings(userId: string): Promise<(Movie & { ranking: Ranking })[]> {
  const { data, error } = await supabase
    .from('rankings')
    .select(`
      *,
      movies (*)
    `)
    .eq('user_id', userId)
    .order('rank_position', { ascending: true });

  if (error) {
    console.error('Error fetching rankings:', error);
    return [];
  }

  // Transform the data to match our expected structure
  return (data || []).map((item: { movies: Movie } & Ranking) => ({
    ...item.movies,
    ranking: {
      id: item.id,
      user_id: item.user_id,
      movie_id: item.movie_id,
      rank_position: item.rank_position,
      elo_score: item.elo_score,
      created_at: item.created_at,
      updated_at: item.updated_at,
    },
  }));
}

/**
 * Initialize the ranking state for binary insertion sort
 */
export function initializeRankingState(
  newMovie: Movie,
  existingRankings: (Movie & { ranking: Ranking })[]
): RankingState {
  const n = existingRankings.length;
  const maxComparisons = n === 0 ? 0 : Math.ceil(Math.log2(n + 1));

  return {
    newMovie,
    rankedMovies: existingRankings,
    low: 0,
    high: n,
    mid: Math.floor(n / 2),
    comparisons: 0,
    maxComparisons,
    isComplete: n === 0,
    finalPosition: n === 0 ? 1 : -1,
  };
}

/**
 * Get the current comparison (which two movies to compare)
 */
export function getCurrentComparison(state: RankingState): Comparison | null {
  if (state.isComplete || state.rankedMovies.length === 0) {
    return null;
  }

  return {
    movieA: state.newMovie,
    movieB: state.rankedMovies[state.mid],
    currentIndex: state.comparisons + 1,
    totalComparisons: state.maxComparisons,
  };
}

/**
 * Process user's choice: true = prefers new movie (A), false = prefers existing (B)
 * Returns updated state
 */
export function processComparison(state: RankingState, prefersNewMovie: boolean): RankingState {
  const newState = { ...state };
  newState.comparisons++;

  if (prefersNewMovie) {
    // New movie is better, search in upper half (lower positions = better)
    newState.high = state.mid;
  } else {
    // Existing movie is better, search in lower half
    newState.low = state.mid + 1;
  }

  if (newState.low >= newState.high) {
    // Found the position
    newState.isComplete = true;
    newState.finalPosition = newState.low + 1; // 1-indexed
  } else {
    // Continue binary search
    newState.mid = Math.floor((newState.low + newState.high) / 2);
  }

  return newState;
}

/**
 * Save the final ranking to the database
 */
export async function saveRanking(
  userId: string,
  movie: Movie,
  position: number
): Promise<void> {
  // First, cache the movie if not already cached
  await supabase.from('movies').upsert({
    id: movie.id,
    title: movie.title,
    poster_url: movie.poster_url,
    backdrop_url: movie.backdrop_url,
    release_year: movie.release_year,
    genres: movie.genres,
    director: movie.director,
    synopsis: movie.synopsis,
    popularity_score: movie.popularity_score,
    runtime_minutes: movie.runtime_minutes,
  });

  // Check if movie already has a ranking
  const { data: existingRanking } = await supabase
    .from('rankings')
    .select('id, rank_position')
    .eq('user_id', userId)
    .eq('movie_id', movie.id)
    .single();

  if (existingRanking) {
    const oldPosition = existingRanking.rank_position;

    if (oldPosition === position) {
      // No change needed
      return;
    }

    // Update positions of movies between old and new position
    if (oldPosition < position) {
      // Moving down: shift movies up
      await supabase.rpc('shift_rankings_up', {
        p_user_id: userId,
        p_start_position: oldPosition + 1,
        p_end_position: position,
      });
    } else {
      // Moving up: shift movies down
      await supabase.rpc('shift_rankings_down', {
        p_user_id: userId,
        p_start_position: position,
        p_end_position: oldPosition - 1,
      });
    }

    // Update the movie's position
    await supabase
      .from('rankings')
      .update({
        rank_position: position,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingRanking.id);
  } else {
    // Shift existing rankings down to make room
    await supabase
      .from('rankings')
      .update({ rank_position: supabase.rpc('increment_position') })
      .eq('user_id', userId)
      .gte('rank_position', position);

    // More direct approach: shift rankings down
    const { data: rankingsToShift } = await supabase
      .from('rankings')
      .select('id, rank_position')
      .eq('user_id', userId)
      .gte('rank_position', position)
      .order('rank_position', { ascending: false });

    // Update each ranking one by one (in reverse order to avoid conflicts)
    for (const ranking of rankingsToShift || []) {
      await supabase
        .from('rankings')
        .update({ rank_position: ranking.rank_position + 1 })
        .eq('id', ranking.id);
    }

    // Insert the new ranking
    await supabase.from('rankings').insert({
      user_id: userId,
      movie_id: movie.id,
      rank_position: position,
      elo_score: 1000, // Default ELO score
    });
  }
}

/**
 * Remove a ranking and shift others up
 */
export async function removeRanking(userId: string, movieId: number): Promise<void> {
  // Get the current position
  const { data: ranking } = await supabase
    .from('rankings')
    .select('id, rank_position')
    .eq('user_id', userId)
    .eq('movie_id', movieId)
    .single();

  if (!ranking) return;

  // Delete the ranking
  await supabase.from('rankings').delete().eq('id', ranking.id);

  // Shift rankings above this position up
  const { data: rankingsToShift } = await supabase
    .from('rankings')
    .select('id, rank_position')
    .eq('user_id', userId)
    .gt('rank_position', ranking.rank_position)
    .order('rank_position', { ascending: true });

  for (const r of rankingsToShift || []) {
    await supabase
      .from('rankings')
      .update({ rank_position: r.rank_position - 1 })
      .eq('id', r.id);
  }
}
