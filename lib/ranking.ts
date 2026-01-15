import { supabase } from './supabase';
import { Movie, Ranking, Review } from '@/types';

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
 */
export async function getUserRankingsWithRatings(userId: string): Promise<RankedMovie[]> {
  // Fetch rankings with movies
  const { data: rankingsData, error: rankingsError } = await supabase
    .from('rankings')
    .select(`
      *,
      movies (*)
    `)
    .eq('user_id', userId)
    .order('rank_position', { ascending: true });

  if (rankingsError) {
    console.error('Error fetching rankings:', rankingsError);
    return [];
  }

  if (!rankingsData || rankingsData.length === 0) {
    return [];
  }

  // Get movie IDs to fetch reviews
  const movieIds = rankingsData.map((r: any) => r.movie_id);

  // Fetch reviews for these movies
  const { data: reviewsData, error: reviewsError } = await supabase
    .from('reviews')
    .select('movie_id, star_rating')
    .eq('user_id', userId)
    .in('movie_id', movieIds);

  if (reviewsError) {
    console.error('Error fetching reviews:', reviewsError);
  }

  // Create a map of movie_id -> star_rating
  const reviewsMap = new Map<number, number>();
  for (const review of reviewsData || []) {
    reviewsMap.set(review.movie_id, review.star_rating);
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
        rank_position: item.rank_position,
        elo_score: item.elo_score,
        created_at: item.created_at,
        updated_at: item.updated_at,
      },
      star_rating: reviewsMap.get(item.movie_id) || 0,
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
 * Initialize ranking state with star rating tier awareness
 */
export function initializeRankingStateWithTier(
  newMovie: Movie,
  starRating: number,
  allRankings: RankedMovie[]
): RankingState {
  // Filter to movies in the same star rating tier
  const tierMovies = allRankings.filter(m => m.star_rating === starRating);

  // Sort tier movies by relevance to the new movie
  const sortedTierMovies = sortByRelevance(tierMovies, newMovie);

  const n = sortedTierMovies.length;
  const maxComparisons = n === 0 ? 0 : Math.ceil(Math.log2(n + 1));

  return {
    newMovie,
    starRating,
    tierMovies: sortedTierMovies,
    allRankings,
    low: 0,
    high: n,
    comparisonIndex: n > 0 ? Math.floor(n / 2) : 0,
    comparisons: 0,
    maxComparisons,
    isComplete: n === 0,
    tierPosition: n === 0 ? 1 : -1,
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
 * Calculate global position based on star rating tiers
 * 5-star movies come first, then 4-star, etc.
 */
function calculateGlobalPosition(
  tierPosition: number,
  starRating: number,
  allRankings: RankedMovie[]
): number {
  // Count movies in higher-rated tiers
  let position = 0;

  for (let rating = 5; rating > starRating; rating--) {
    position += allRankings.filter(m => m.star_rating === rating).length;
  }

  // Add position within current tier
  position += tierPosition;

  return position;
}

/**
 * Save the ranking to database with tier-aware positioning
 */
export async function saveRanking(
  userId: string,
  movie: Movie,
  tierPosition: number,
  starRating?: number
): Promise<void> {
  // Cache the movie with all attributes including collection data
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
    collection_id: movie.collection_id,
    collection_name: movie.collection_name,
    updated_at: new Date().toISOString(),
  });

  // Get all rankings with star ratings to calculate global positions
  const allRankings = await getUserRankingsWithRatings(userId);

  // Get the star rating (from param or fetch from review)
  let rating = starRating;
  if (!rating) {
    const { data: review } = await supabase
      .from('reviews')
      .select('star_rating')
      .eq('user_id', userId)
      .eq('movie_id', movie.id)
      .single();
    rating = review?.star_rating || 3;
  }

  // Calculate global position
  const globalPosition = calculateGlobalPosition(tierPosition, rating, allRankings);

  // Check if movie already has a ranking
  const { data: existingRanking } = await supabase
    .from('rankings')
    .select('id, rank_position')
    .eq('user_id', userId)
    .eq('movie_id', movie.id)
    .single();

  if (existingRanking) {
    // Remove the existing ranking first
    await supabase.from('rankings').delete().eq('id', existingRanking.id);
  }

  // Recalculate all positions based on star rating tiers
  await recalculateAllPositions(userId, movie.id, tierPosition, rating);
}

/**
 * Recalculate all ranking positions based on star rating tiers
 * This ensures 5-star movies always rank above 4-star, etc.
 */
async function recalculateAllPositions(
  userId: string,
  newMovieId: number,
  newTierPosition: number,
  newStarRating: number
): Promise<void> {
  // Fetch all existing rankings
  const { data: rankingsData } = await supabase
    .from('rankings')
    .select('id, movie_id, rank_position')
    .eq('user_id', userId)
    .order('rank_position', { ascending: true });

  if (!rankingsData) return;

  // Get movie IDs to fetch reviews
  const existingMovieIds = rankingsData.map(r => r.movie_id);
  const allMovieIds = [...existingMovieIds, newMovieId];

  // Fetch reviews for star ratings
  const { data: reviewsData } = await supabase
    .from('reviews')
    .select('movie_id, star_rating')
    .eq('user_id', userId)
    .in('movie_id', allMovieIds);

  // Create map of movie_id -> star_rating
  const reviewsMap = new Map<number, number>();
  for (const review of reviewsData || []) {
    reviewsMap.set(review.movie_id, review.star_rating);
  }

  // Group existing rankings by star rating
  const byRating: Map<number, { id: string; movie_id: number }[]> = new Map();

  for (const r of rankingsData) {
    const rating = reviewsMap.get(r.movie_id) || 0;
    if (!byRating.has(rating)) {
      byRating.set(rating, []);
    }
    byRating.get(rating)!.push({ id: r.id, movie_id: r.movie_id });
  }

  // Add new movie's tier if it doesn't exist
  if (!byRating.has(newStarRating)) {
    byRating.set(newStarRating, []);
  }

  // Insert new ranking first
  const { data: newRanking } = await supabase
    .from('rankings')
    .insert({
      user_id: userId,
      movie_id: newMovieId,
      rank_position: 0,
      elo_score: 1500,
    })
    .select('id')
    .single();

  if (newRanking) {
    // Insert at correct tier position
    const tier = byRating.get(newStarRating)!;
    const insertIndex = Math.min(newTierPosition - 1, tier.length);
    tier.splice(insertIndex, 0, { id: newRanking.id, movie_id: newMovieId });
  }

  // Batch update all positions
  let globalPosition = 1;
  const updates: { id: string; position: number }[] = [];

  // Process ratings from 5 down to 1
  for (let rating = 5; rating >= 1; rating--) {
    const tierMovies = byRating.get(rating) || [];
    for (const movie of tierMovies) {
      updates.push({ id: movie.id, position: globalPosition });
      globalPosition++;
    }
  }

  // Execute updates (batched for performance)
  for (const update of updates) {
    await supabase
      .from('rankings')
      .update({
        rank_position: update.position,
        updated_at: new Date().toISOString(),
      })
      .eq('id', update.id);
  }
}

/**
 * Remove a ranking and recalculate positions
 */
export async function removeRanking(userId: string, movieId: number): Promise<void> {
  // Delete the ranking
  await supabase
    .from('rankings')
    .delete()
    .eq('user_id', userId)
    .eq('movie_id', movieId);

  // Recalculate all positions to close the gap
  const rankings = await getUserRankingsWithRatings(userId);

  let globalPosition = 1;

  // Sort by star rating desc, then by current position
  const sorted = rankings.sort((a, b) => {
    if (b.star_rating !== a.star_rating) {
      return b.star_rating - a.star_rating;
    }
    return a.ranking.rank_position - b.ranking.rank_position;
  });

  for (const ranking of sorted) {
    if (ranking.ranking.rank_position !== globalPosition) {
      await supabase
        .from('rankings')
        .update({ rank_position: globalPosition })
        .eq('id', ranking.ranking.id);
    }
    globalPosition++;
  }
}
