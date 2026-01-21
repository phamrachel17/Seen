import { supabase } from './supabase';
import { Movie, Ranking, Review, ContentType } from '@/types';
import { ensureContentExists } from './content';
import { createActivity } from './activity';

// Movie with ranking and review data
export interface RankedMovie extends Movie {
  ranking: Ranking;
  star_rating: number;
}

// Represents a comparison during ranking
export interface Comparison {
  movieA: Movie;
  movieB: RankedMovie;
  currentIndex: number;
  totalComparisons: number;
}

// State for the binary insertion process
export interface RankingState {
  newMovie: Movie;
  starRating: number;
  tierMovies: RankedMovie[];     // Movies in the same star rating tier
  allRankings: RankedMovie[];    // All ranked movies for recalculation
  low: number;
  high: number;
  comparisonIndex: number;       // Current comparison movie index
  comparisons: number;
  maxComparisons: number;
  isComplete: boolean;
  tierPosition: number;          // Position within the tier
  finalPosition: number;         // Global position across all tiers
}

// Scoring weights for comparison selection
const SCORE_WEIGHTS = {
  GENRE_MATCH: 3,
  SAME_DIRECTOR: 5,
  ERA_SAME: 3,
  ERA_ADJACENT: 2,
  ERA_RELATED: 1,
  BUDGET_TIER: 2,
  SAME_FRANCHISE: 10,
} as const;

/**
 * Calculate similarity score between two movies for smarter comparison selection
 */
function calculateSimilarityScore(candidate: Movie, newMovie: Movie): number {
  let score = 0;

  // Genre overlap (3 pts per matching genre)
  const newGenres = new Set(newMovie.genres || []);
  const genreMatches = (candidate.genres || []).filter(g => newGenres.has(g)).length;
  score += genreMatches * SCORE_WEIGHTS.GENRE_MATCH;

  // Same director (5 pts)
  if (candidate.director && newMovie.director &&
      candidate.director.toLowerCase() === newMovie.director.toLowerCase()) {
    score += SCORE_WEIGHTS.SAME_DIRECTOR;
  }

  // Era proximity (0-3 pts)
  const yearDiff = Math.abs((candidate.release_year || 0) - (newMovie.release_year || 0));
  if (yearDiff <= 5) {
    score += SCORE_WEIGHTS.ERA_SAME;
  } else if (yearDiff <= 10) {
    score += SCORE_WEIGHTS.ERA_ADJACENT;
  } else if (yearDiff <= 20) {
    score += SCORE_WEIGHTS.ERA_RELATED;
  }

  // Budget tier using popularity as proxy (2 pts if same tier)
  const getBudgetTier = (pop: number): string => {
    if (pop > 50) return 'blockbuster';
    if (pop > 20) return 'mainstream';
    return 'indie';
  };
  if (getBudgetTier(candidate.popularity_score) === getBudgetTier(newMovie.popularity_score)) {
    score += SCORE_WEIGHTS.BUDGET_TIER;
  }

  // Same franchise/collection (10 pts)
  if (candidate.collection_id && newMovie.collection_id &&
      candidate.collection_id === newMovie.collection_id) {
    score += SCORE_WEIGHTS.SAME_FRANCHISE;
  }

  return score;
}

/**
 * Sort candidates by similarity and return optimal comparison order
 * Higher similarity movies are compared first for more meaningful choices
 */
function sortByRelevance(candidates: RankedMovie[], newMovie: Movie): RankedMovie[] {
  const scored = candidates.map(c => ({
    movie: c,
    score: calculateSimilarityScore(c, newMovie),
  }));

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  return scored.map(s => s.movie);
}

/**
 * Get user's rankings with star ratings from reviews
 * Filtered by content type (movie or tv)
 */
export async function getUserRankingsWithRatings(
  userId: string,
  contentType: ContentType = 'movie'
): Promise<RankedMovie[]> {
  // Fetch rankings with movies, filtered by content_type
  const { data: rankingsData, error: rankingsError } = await supabase
    .from('rankings')
    .select(`
      *,
      movies (*)
    `)
    .eq('user_id', userId)
    .eq('content_type', contentType)
    .order('rank_position', { ascending: true });

  if (rankingsError) {
    console.error('Error fetching rankings:', rankingsError);
    return [];
  }

  if (!rankingsData || rankingsData.length === 0) {
    return [];
  }

  // Get TMDB IDs from rankings
  const tmdbIds = rankingsData.map((r: any) => r.movie_id);

  // Map TMDB IDs to internal content IDs
  const { data: contentMapping } = await supabase
    .from('content')
    .select('id, tmdb_id')
    .in('tmdb_id', tmdbIds);

  // Build TMDB ID → content ID map
  const tmdbToContentMap = new Map<number, number>();
  for (const content of contentMapping || []) {
    tmdbToContentMap.set(content.tmdb_id, content.id);
  }

  // Get internal content IDs for activity query
  const contentIds = rankingsData
    .map((r: any) => tmdbToContentMap.get(r.movie_id))
    .filter((id): id is number => id !== undefined);

  // Fetch completed activities with star ratings using content IDs
  const { data: activitiesData, error: activitiesError } = await supabase
    .from('activity_log')
    .select('content_id, star_rating')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .in('content_id', contentIds)
    .not('star_rating', 'is', null);

  if (activitiesError) {
    console.error('Error fetching activities:', activitiesError);
  }

  // Create a map of content_id -> star_rating
  const ratingsMap = new Map<number, number>();
  for (const activity of activitiesData || []) {
    ratingsMap.set(activity.content_id, activity.star_rating);
  }

  // Combine the data
  return rankingsData
    .filter((item: any) => item.movies)
    .map((item: any) => ({
      ...item.movies,
      ranking: {
        id: item.id,
        user_id: item.user_id,
        movie_id: item.movie_id,
        content_id: item.content_id,
        content_type: item.content_type,
        rank_position: item.rank_position,
        elo_score: item.elo_score,
        created_at: item.created_at,
        updated_at: item.updated_at,
      },
      star_rating: ratingsMap.get(tmdbToContentMap.get(item.movie_id)) || 0,
    }));
}

/**
 * Get user's ranked movies sorted by position (legacy support)
 */
export async function getUserRankings(userId: string): Promise<(Movie & { ranking: Ranking })[]> {
  const rankings = await getUserRankingsWithRatings(userId);
  return rankings;
}

/**
 * Initialize the ranking state for star-tiered binary insertion
 */
export function initializeRankingState(
  newMovie: Movie,
  existingRankings: (Movie & { ranking: Ranking })[]
): RankingState {
  // Legacy fallback - use default star rating of 3
  return initializeRankingStateWithTier(newMovie, 3, existingRankings as RankedMovie[]);
}

/**
 * Initialize ranking state - compares ONLY against movies with same star rating
 * Uses binary search on RANK-SORTED movies for correct monotonic narrowing
 */
export function initializeRankingStateWithTier(
  newMovie: Movie,
  starRating: number,
  allRankings: RankedMovie[]
): RankingState {
  // Filter to only movies with the SAME star rating (tier-based comparison)
  const tierMovies = allRankings.filter(m => m.star_rating === starRating);

  // CRITICAL: Sort by rank_position for binary search correctness
  // This ensures comparisons monotonically narrow toward insertion point
  const rankSortedMovies = [...tierMovies].sort(
    (a, b) => a.ranking.rank_position - b.ranking.rank_position
  );

  const n = rankSortedMovies.length;
  const maxComparisons = n === 0 ? 0 : Math.ceil(Math.log2(n + 1));

  return {
    newMovie,
    starRating,
    tierMovies: rankSortedMovies,  // Sorted by rank_position for binary search
    allRankings,
    low: 0,
    high: n,
    comparisonIndex: n > 0 ? Math.floor(n / 2) : 0,
    comparisons: 0,
    maxComparisons,
    isComplete: n === 0,
    tierPosition: n === 0 ? 1 : -1,  // Position within tier
    finalPosition: -1,
  };
}

/**
 * Get the current comparison (new movie vs candidate from tier)
 */
export function getCurrentComparison(state: RankingState): Comparison | null {
  if (state.isComplete || state.tierMovies.length === 0) {
    return null;
  }

  return {
    movieA: state.newMovie,
    movieB: state.tierMovies[state.comparisonIndex],
    currentIndex: state.comparisons + 1,
    totalComparisons: state.maxComparisons,
  };
}

/**
 * Process user's choice in comparison
 * prefersNewMovie: true = new movie is better, false = existing movie is better
 */
export function processComparison(state: RankingState, prefersNewMovie: boolean): RankingState {
  const newState = { ...state };
  newState.comparisons++;

  if (prefersNewMovie) {
    // New movie is better, search in upper half (lower positions = better)
    newState.high = state.comparisonIndex;
  } else {
    // Existing movie is better, search in lower half
    newState.low = state.comparisonIndex + 1;
  }

  if (newState.low >= newState.high) {
    // Found the position within tier
    newState.isComplete = true;
    newState.tierPosition = newState.low + 1; // 1-indexed within tier
  } else {
    // Continue binary search
    newState.comparisonIndex = Math.floor((newState.low + newState.high) / 2);
  }

  return newState;
}

/**
 * Save the ranking to database using tier-based positioning
 *
 * Global position is calculated as:
 * (count of movies in higher star tiers) + (position within current tier)
 *
 * This ensures 5-star movies always rank above 4-star, etc.
 * Rankings are now separated by content_type (movie vs tv)
 */
export async function saveRanking(
  userId: string,
  movie: Movie,
  tierPosition: number,
  starRating: number,
  contentType: ContentType = 'movie'
): Promise<void> {
  try {
    // Cache the movie with all attributes
    const { error: movieError } = await supabase.from('movies').upsert({
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
      collection_id: movie.collection_id,
      collection_name: movie.collection_name,
      updated_at: new Date().toISOString(),
    });

    if (movieError) {
      console.error('Error caching movie:', movieError);
    }

    // Check if movie already has a ranking for this content type
    const { data: existingRanking } = await supabase
      .from('rankings')
      .select('id, rank_position')
      .eq('user_id', userId)
      .eq('movie_id', movie.id)
      .eq('content_type', contentType)
      .single();

    if (existingRanking) {
      console.log('Content already ranked at position:', existingRanking.rank_position);
      return;
    }

    // Get all rankings for this content type with their star ratings
    const allRankings = await getUserRankingsWithRatings(userId, contentType);

    // Count movies in HIGHER star rating tiers (they come before this movie)
    const moviesInHigherTiers = allRankings.filter(m => m.star_rating > starRating).length;

    // Global position = higher tier count + position within tier
    const globalPosition = moviesInHigherTiers + tierPosition;

    // Shift existing rankings down to make room (only within same content_type)
    const { data: toShift } = await supabase
      .from('rankings')
      .select('id, rank_position')
      .eq('user_id', userId)
      .eq('content_type', contentType)
      .gte('rank_position', globalPosition)
      .order('rank_position', { ascending: false });

    // Update positions from highest to lowest to avoid constraint violations
    for (const ranking of toShift || []) {
      await supabase
        .from('rankings')
        .update({ rank_position: ranking.rank_position + 1 })
        .eq('id', ranking.id);
    }

    // Insert the new ranking with content_type
    const { error: insertError } = await supabase.from('rankings').insert({
      user_id: userId,
      movie_id: movie.id,
      content_type: contentType,
      rank_position: globalPosition,
      elo_score: 1500,
    });

    if (insertError) {
      console.error('Error inserting ranking:', insertError);
      throw insertError;
    }

    console.log(`Ranking saved: tier position ${tierPosition} → global position ${globalPosition} (${contentType})`);

    // Ensure content exists and create completed activity
    try {
      // Ensure movie exists in content table and get content ID
      const content = await ensureContentExists(movie.id, 'movie');

      if (!content) {
        console.error('Failed to ensure content exists for movie:', movie.id);
        throw new Error(`Content creation failed for TMDB ID ${movie.id}`);
      }

      // Check if activity already exists to avoid duplicates
      const { data: existingActivity } = await supabase
        .from('activity_log')
        .select('id')
        .eq('user_id', userId)
        .eq('content_id', content.id)
        .eq('status', 'completed')
        .single();

      if (!existingActivity) {
        // Create completed activity with the star rating
        const activityResult = await createActivity({
          userId: userId,
          tmdbId: movie.id,
          contentType: 'movie',
          status: 'completed',
          starRating: starRating,
          watchDate: new Date(),
          isPrivate: false,
        });

        if (!activityResult) {
          throw new Error('createActivity returned null/undefined');
        }

        console.log('Created completed activity for ranking:', activityResult.id);
      } else {
        console.log('Activity already exists for this ranking, skipping creation');
      }
    } catch (activityError) {
      console.error('Error creating activity for ranking:', activityError);
      // Throw error to surface data consistency issues
      throw new Error(`Failed to create activity for ranking: ${activityError}`);
    }
  } catch (error) {
    console.error('Error in saveRanking:', error);
    throw error;
  }
}

/**
 * Remove a ranking and shift positions to close gap
 * Only shifts rankings within the same content_type
 */
export async function removeRanking(
  userId: string,
  movieId: number,
  contentType: ContentType = 'movie'
): Promise<void> {
  // Get the ranking to delete
  const { data: toDelete } = await supabase
    .from('rankings')
    .select('id, rank_position, content_type')
    .eq('user_id', userId)
    .eq('movie_id', movieId)
    .eq('content_type', contentType)
    .single();

  if (!toDelete) return;

  const deletedPosition = toDelete.rank_position;

  // Delete the ranking
  await supabase
    .from('rankings')
    .delete()
    .eq('id', toDelete.id);

  // Shift rankings above the deleted position up (only within same content_type)
  const { data: toShift } = await supabase
    .from('rankings')
    .select('id, rank_position')
    .eq('user_id', userId)
    .eq('content_type', contentType)
    .gt('rank_position', deletedPosition)
    .order('rank_position', { ascending: true });

  for (const ranking of toShift || []) {
    await supabase
      .from('rankings')
      .update({ rank_position: ranking.rank_position - 1 })
      .eq('id', ranking.id);
  }
}
