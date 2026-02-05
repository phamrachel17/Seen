import { supabase } from './supabase';
import { Movie, Ranking, Review, ContentType } from '@/types';
import { ensureContentExists } from './content';
import { createActivity } from './activity';

// Movie with ranking and review data
export interface RankedMovie extends Movie {
  ranking: Ranking;
  star_rating: number | null;  // null indicates missing data (not 0 stars)
}

// Database row type for rankings query result
// Note: Supabase returns foreign key relations as single objects, not arrays
interface RankingRowRaw {
  id: string;
  user_id: string;
  movie_id: number;
  content_type: ContentType;
  rank_position: number;
  display_score: number;
  created_at: string;
  updated_at: string;
  movies: Movie | null;  // FK relation returns single object, not array
}

// Normalized ranking row after extracting the first movie
interface RankingRow {
  id: string;
  user_id: string;
  movie_id: number;
  content_type: ContentType;
  rank_position: number;
  display_score: number;
  created_at: string;
  updated_at: string;
  movie: Movie | null;
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

// ============================================
// STAR RATING SCORE BANDS (Soft Guidelines)
// ============================================
// These define the natural score ranges for each star rating.
// Scores are NOT forced to normalize - they reflect the star rating.

const STAR_SCORE_BANDS = {
  5: { min: 9.5, max: 10.0, default: 9.75 },
  4: { min: 8.0, max: 9.4, default: 8.7 },
  3: { min: 6.0, max: 7.9, default: 7.0 },
  2: { min: 4.0, max: 5.9, default: 5.0 },
  1: { min: 1.0, max: 3.9, default: 2.5 },
} as const;

/**
 * Get the score band boundaries for a star rating
 */
function getScoreBandForStar(starRating: number): { min: number; max: number; default: number } {
  return STAR_SCORE_BANDS[starRating as keyof typeof STAR_SCORE_BANDS] ?? STAR_SCORE_BANDS[3];
}

/**
 * Get the default score for a star rating (used for first item in tier)
 */
function getDefaultScoreForStar(starRating: number): number {
  return getScoreBandForStar(starRating).default;
}

/**
 * Determine the minimum star rating that matches a given score
 * Used for auto-promotion when reordering
 */
function getMinStarForScore(score: number): number {
  if (score >= 9.5) return 5;
  if (score >= 8.0) return 4;
  if (score >= 6.0) return 3;
  if (score >= 4.0) return 2;
  return 1;
}

/**
 * Calculate score for a new item based on its position and neighbors.
 * Does NOT normalize entire list - only calculates appropriate score for insertion point.
 * This is the core of the "intuitive" scoring system.
 */
function calculateNeighborAwareScore(
  globalPosition: number,
  allRankings: RankedMovie[],
  starRating: number
): number {
  const band = getScoreBandForStar(starRating);

  // If no existing rankings, this is the first movie - give it the MAX for its tier
  if (allRankings.length === 0) {
    return band.max;
  }

  // Get neighbors based on global position (rankings are sorted by rank_position)
  const aboveItem = allRankings.find(r => r.ranking.rank_position === globalPosition - 1);
  const belowItem = allRankings.find(r => r.ranking.rank_position === globalPosition);

  let score: number;

  if (!aboveItem && belowItem) {
    // Inserting at TOP of list - this is the new #1, give it the MAX
    score = band.max;
  } else if (aboveItem && !belowItem) {
    // Inserting at bottom - score slightly below the item above, but within band
    score = Math.max(aboveItem.ranking.display_score - 0.3, band.min);
  } else if (aboveItem && belowItem) {
    // Inserting between two items - use midpoint
    score = (aboveItem.ranking.display_score + belowItem.ranking.display_score) / 2;
  } else {
    // First item in list - give it the MAX for its tier
    score = band.max;
  }

  // Strict clamp to band boundaries
  score = Math.max(band.min, Math.min(band.max, score));

  return Number(score.toFixed(1));
}

/**
 * Ensure all rankings have monotonically decreasing scores.
 * Fixes any inversions by adjusting scores to be 0.1 below the item above.
 * This prevents the bug where items pushed down by insertions retain old scores.
 */
async function ensureScoreMonotonicity(
  userId: string,
  contentType: ContentType
): Promise<void> {
  const rankings = await getUserRankingsWithRatings(userId, contentType);
  const sorted = [...rankings].sort((a, b) => a.ranking.rank_position - b.ranking.rank_position);

  const updates: { id: string; display_score: number }[] = [];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const above = sorted[i - 1];

    if (current.ranking.display_score >= above.ranking.display_score) {
      // Inversion detected - fix it
      const fixedScore = Math.max(above.ranking.display_score - 0.1, 1.0);
      // Update the local copy so subsequent comparisons use the fixed value
      current.ranking.display_score = Number(fixedScore.toFixed(1));
      updates.push({ id: current.ranking.id, display_score: current.ranking.display_score });
    }
  }

  // Batch update all fixes
  for (const update of updates) {
    await supabase.from('rankings')
      .update({ display_score: update.display_score })
      .eq('id', update.id);
  }
}

// Scoring weights for comparison selection (similarity-based)
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
  // Select only needed columns to reduce payload size
  const { data: rankingsData, error: rankingsError } = await supabase
    .from('rankings')
    .select(`
      id, user_id, movie_id, content_type, rank_position, display_score, created_at, updated_at,
      movies (id, title, poster_url, backdrop_url, release_year, genres, director, synopsis, runtime_minutes, popularity_score, collection_id, collection_name)
    `)
    .eq('user_id', userId)
    .eq('content_type', contentType)
    .order('rank_position', { ascending: true });

  if (rankingsError) {
    console.error('Error fetching rankings:', rankingsError);
    return [];
  }

  // If empty, try once more after a short delay (network race condition workaround)
  if (!rankingsData || rankingsData.length === 0) {
    await new Promise(resolve => setTimeout(resolve, 300));

    const { data: retryData, error: retryError } = await supabase
      .from('rankings')
      .select(`
        id, user_id, movie_id, content_type, rank_position, display_score, created_at, updated_at,
        movies (id, title, poster_url, backdrop_url, release_year, genres, director, synopsis, runtime_minutes, popularity_score, collection_id, collection_name)
      `)
      .eq('user_id', userId)
      .eq('content_type', contentType)
      .order('rank_position', { ascending: true });

    if (retryError || !retryData || retryData.length === 0) {
      return [];
    }

    // Use retry data instead
    const rawRetryData = retryData as RankingRowRaw[];
    const typedRetryData: RankingRow[] = rawRetryData.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      movie_id: r.movie_id,
      content_type: r.content_type,
      rank_position: r.rank_position,
      display_score: r.display_score,
      created_at: r.created_at,
      updated_at: r.updated_at,
      movie: r.movies ?? null,  // FK returns single object, not array
    }));

    // Continue with retry data
    return processRankingsData(typedRetryData, userId);
  }

  // Cast and normalize the raw data (Supabase returns FK as single object)
  const rawData = rankingsData as RankingRowRaw[];
  const typedRankingsData: RankingRow[] = rawData.map((r) => ({
    id: r.id,
    user_id: r.user_id,
    movie_id: r.movie_id,
    content_type: r.content_type,
    rank_position: r.rank_position,
    display_score: r.display_score,
    created_at: r.created_at,
    updated_at: r.updated_at,
    movie: r.movies ?? null,  // FK returns single object, not array
  }));

  return processRankingsData(typedRankingsData, userId);
}

/**
 * Helper function to process rankings data and fetch star ratings
 * Extracted to support retry logic
 */
async function processRankingsData(
  typedRankingsData: RankingRow[],
  userId: string
): Promise<RankedMovie[]> {
  // Get TMDB IDs from rankings
  const tmdbIds = typedRankingsData.map((r) => r.movie_id);

  // Map TMDB IDs to internal content IDs
  const { data: contentMapping } = await supabase
    .from('content')
    .select('id, tmdb_id')
    .in('tmdb_id', tmdbIds);

  // Build TMDB ID → content ID map
  // Use Number() to ensure consistent types (Supabase may return strings)
  const tmdbToContentMap = new Map<number, number>();
  for (const content of contentMapping || []) {
    tmdbToContentMap.set(Number(content.tmdb_id), Number(content.id));
  }

  // Get internal content IDs for activity query
  const contentIds = typedRankingsData
    .map((r) => tmdbToContentMap.get(Number(r.movie_id)))
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
  // Use Number() to ensure consistent types (Supabase may return strings)
  const ratingsMap = new Map<number, number>();
  for (const activity of activitiesData || []) {
    ratingsMap.set(Number(activity.content_id), Number(activity.star_rating));
  }

  // Combine the data - filter out rows without movies and map to RankedMovie
  // IMPORTANT: star_rating uses null (not 0) to indicate missing data
  return typedRankingsData
    .filter((item): item is RankingRow & { movie: Movie } => item.movie !== null)
    .map((item) => {
      const contentId = tmdbToContentMap.get(Number(item.movie_id));
      const starRating = contentId !== undefined ? ratingsMap.get(contentId) : undefined;

      return {
        ...item.movie,
        ranking: {
          id: item.id,
          user_id: item.user_id,
          movie_id: item.movie_id,
          content_type: item.content_type,
          rank_position: item.rank_position,
          display_score: item.display_score,
          created_at: item.created_at,
          updated_at: item.updated_at,
        },
        star_rating: starRating ?? null,  // null indicates missing data, NOT 0 stars
      };
    });
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
 * Initialize ranking state - compares ONLY against movies with the SAME star rating.
 *
 * KEY BEHAVIOR:
 * - 5★ movies ONLY compare against other 5★ movies
 * - If no same-star movies exist, skip comparisons entirely (auto-place in tier)
 * - This prevents illogical cross-band comparisons (e.g., 5★ vs 3★)
 */
export function initializeRankingStateWithTier(
  newMovie: Movie,
  starRating: number,
  allRankings: RankedMovie[]
): RankingState {
  // DEFENSIVE: Filter out movies with null/invalid star_rating
  const validRankings = allRankings.filter(
    (r): r is RankedMovie & { star_rating: number } =>
      r.star_rating !== null && r.star_rating > 0
  );

  // Filter to movies with the SAME star rating (not by display_score band)
  // This is the key fix - compare only within exact star tier
  // Also exclude the movie being ranked to prevent self-comparison when reranking
  // IMPORTANT: Use Number() to ensure type coercion - DB may return strings
  const sameTierMovies = validRankings.filter(
    m => Number(m.star_rating) === Number(starRating) && Number(m.id) !== Number(newMovie.id)
  );

  // Sort by display_score descending for binary search
  // Higher scores at lower indices (position 0 = best in tier)
  const scoreSortedMovies = [...sameTierMovies].sort(
    (a, b) => b.ranking.display_score - a.ranking.display_score
  );

  const n = scoreSortedMovies.length;
  const maxComparisons = n === 0 ? 0 : Math.ceil(Math.log2(n + 1));

  return {
    newMovie,
    starRating,
    tierMovies: scoreSortedMovies,  // Only same-star movies with valid ratings
    allRankings,
    low: 0,
    high: n,
    comparisonIndex: n > 0 ? Math.floor(n / 2) : 0,
    comparisons: 0,
    maxComparisons,
    isComplete: n === 0,  // Skip comparisons if no same-star movies exist
    tierPosition: n === 0 ? 1 : -1,  // Position 1 within tier if first
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
 * Save the ranking to database using STAR-TIER hierarchy.
 *
 * KEY BEHAVIORS:
 * 1. 5★ movies ALWAYS rank above 4★, which rank above 3★, etc.
 * 2. Global position = (count of higher-star movies) + (position within star tier)
 * 3. Display score is calculated using NEIGHBOR-AWARE logic (NOT forced to 10)
 * 4. A 3★ movie's first ranking gets ~6.5, not 10.0
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
      // Remove existing ranking first so it can be re-ranked
      await removeRanking(userId, movie.id, contentType);
    }

    // Get all rankings for this content type with their star ratings
    const allRankings = await getUserRankingsWithRatings(userId, contentType);

    // DEFENSIVE: Filter out rankings with null/invalid star_rating (data integrity issues)
    const validRankings = allRankings.filter(
      (r): r is RankedMovie & { star_rating: number } =>
        r.star_rating !== null && r.star_rating > 0
    );

    // STAR-TIER HIERARCHY: Position based on star rating, not display_score
    // Count movies with HIGHER star ratings (they all rank above this movie)
    // IMPORTANT: Use Number() for type coercion - DB may return strings
    const higherStarCount = validRankings.filter(r => Number(r.star_rating) > Number(starRating)).length;

    // Get movies with the SAME star rating, sorted by score (for tier position)
    // IMPORTANT: Use Number() for type coercion - DB may return strings
    const sameTierMovies = validRankings
      .filter(r => Number(r.star_rating) === Number(starRating))
      .sort((a, b) => b.ranking.display_score - a.ranking.display_score);

    let globalPosition: number;

    if (sameTierMovies.length === 0) {
      // First movie in this star tier - place right after all higher-star movies
      globalPosition = higherStarCount + 1;
    } else if (tierPosition > sameTierMovies.length) {
      // Placing at end of tier - insert after last same-tier movie
      const lastTierMovie = sameTierMovies[sameTierMovies.length - 1];
      globalPosition = lastTierMovie.ranking.rank_position + 1;
    } else {
      // Insert at specific position within tier
      // tierPosition=1 means best in tier → insert before sameTierMovies[0]
      const insertBeforeMovie = sameTierMovies[tierPosition - 1];
      globalPosition = insertBeforeMovie.ranking.rank_position;
    }

    // DEFENSIVE GUARD: A lower-star movie must NEVER be placed before higher-star movies
    // This is a critical sanity check to prevent the bug from recurring
    if (globalPosition <= higherStarCount) {
      console.error(
        `[Ranking] BUG PREVENTED: ${starRating}★ movie would be at position ${globalPosition}, ` +
        `but must be > ${higherStarCount} (count of higher-star movies). Auto-fixing...`
      );
      globalPosition = higherStarCount + 1;
    }

    // Shift existing rankings down to make room using batch RPC (single query instead of O(n))
    const { error: shiftError } = await supabase.rpc('shift_rankings_down', {
      p_user_id: userId,
      p_content_type: contentType,
      p_from_position: globalPosition,
    });

    if (shiftError) {
      console.error('Error shifting rankings:', shiftError);
      throw shiftError;
    }

    // Calculate NEIGHBOR-AWARE score (NOT forced to 10)
    // Re-fetch rankings after shifting to get accurate neighbor positions
    const updatedRankings = await getUserRankingsWithRatings(userId, contentType);
    const displayScore = calculateNeighborAwareScore(globalPosition, updatedRankings, starRating);

    // Insert the new ranking with calculated display_score
    const { error: insertError } = await supabase.from('rankings').insert({
      user_id: userId,
      movie_id: movie.id,
      content_type: contentType,
      rank_position: globalPosition,
      display_score: displayScore,  // Neighbor-aware score, not forced to 10
    });

    if (insertError) {
      console.error('Error inserting ranking:', insertError);
      throw insertError;
    }

    // Fix any score inversions caused by shifting existing rankings
    await ensureScoreMonotonicity(userId, contentType);

    // Ensure content exists and create completed activity
    try {
      // Ensure content exists in content table and get content ID
      const content = await ensureContentExists(movie.id, contentType);

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
          contentType: contentType,
          status: 'completed',
          starRating: starRating,
          watchDate: new Date(),
          isPrivate: false,
        });

        if (!activityResult) {
          throw new Error('createActivity returned null/undefined');
        }
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
 * Reorder rankings after drag-and-drop with AUTO STAR PROMOTION/DEMOTION
 *
 * KEY BEHAVIORS:
 * 1. If a lower-star item is moved above higher-star items → AUTO-PROMOTE
 * 2. If a higher-star item is moved below lower-star items → AUTO-DEMOTE
 * 3. Score is calculated based on NEIGHBORS (midpoint), not full renormalization
 * 4. Star ratings and list positions should NEVER contradict
 */
export async function reorderRankings(
  userId: string,
  contentType: ContentType,
  fromIndex: number,
  toIndex: number
): Promise<void> {
  if (fromIndex === toIndex) return;

  // Fetch all rankings with movie_id for star rating lookup
  const { data: rankings, error } = await supabase
    .from('rankings')
    .select('id, rank_position, movie_id, display_score')
    .eq('user_id', userId)
    .eq('content_type', contentType)
    .order('rank_position', { ascending: true });

  if (error || !rankings || rankings.length === 0) {
    throw new Error('Failed to fetch rankings');
  }

  // Get star ratings from activity_log
  const tmdbIds = rankings.map(r => r.movie_id);
  const { data: contentMapping } = await supabase
    .from('content')
    .select('id, tmdb_id')
    .in('tmdb_id', tmdbIds);

  const tmdbToContentMap = new Map<number, number>();
  for (const c of contentMapping || []) {
    tmdbToContentMap.set(c.tmdb_id, c.id);
  }

  const contentIds = rankings.map(r => tmdbToContentMap.get(r.movie_id)).filter(Boolean) as number[];

  const { data: activities } = await supabase
    .from('activity_log')
    .select('content_id, star_rating')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .in('content_id', contentIds);

  const contentToStarMap = new Map<number, number>();
  for (const a of activities || []) {
    if (a.star_rating) {
      contentToStarMap.set(a.content_id, a.star_rating);
    }
  }

  // Build enriched rankings with star ratings
  // DEFENSIVE: Use null for missing star_rating (not a default of 3)
  const enrichedRankings = rankings.map(r => ({
    ...r,
    star_rating: contentToStarMap.get(tmdbToContentMap.get(r.movie_id) ?? -1) ?? null as number | null,
    content_id: tmdbToContentMap.get(r.movie_id),
  }));

  // Perform the reorder in memory
  const movedItem = enrichedRankings[fromIndex];
  enrichedRankings.splice(fromIndex, 1);
  enrichedRankings.splice(toIndex, 0, movedItem);

  // Check for star rating contradictions and auto-adjust
  const aboveItem = toIndex > 0 ? enrichedRankings[toIndex - 1] : null;
  const belowItem = toIndex < enrichedRankings.length - 1 ? enrichedRankings[toIndex + 1] : null;

  let newStarRating = movedItem.star_rating;

  // AUTO-PROMOTE: If moved above items with higher star ratings
  if (aboveItem && aboveItem.star_rating !== null &&
      movedItem.star_rating !== null &&
      aboveItem.star_rating > movedItem.star_rating) {
    // Moved item is now above something with MORE stars - must promote
    newStarRating = aboveItem.star_rating;
  }

  // AUTO-DEMOTE: If moved below items with lower star ratings significantly
  if (belowItem && belowItem.star_rating !== null &&
      movedItem.star_rating !== null &&
      movedItem.star_rating > belowItem.star_rating) {
    // Check how far below we are - look at items below with valid star ratings
    const itemsBelow = enrichedRankings.slice(toIndex + 1)
      .filter((i): i is typeof i & { star_rating: number } => i.star_rating !== null);
    if (itemsBelow.length > 0) {
      const highestStarBelow = Math.max(...itemsBelow.map(i => i.star_rating));
      // If we're significantly misaligned (more than 1 star difference), demote
      if (movedItem.star_rating > highestStarBelow + 1) {
        newStarRating = highestStarBelow + 1;
      }
    }
  }

  // Calculate new score based on NEIGHBORS (not full renormalization)
  let newScore: number;
  if (aboveItem && belowItem) {
    // Between two items - use midpoint
    newScore = (aboveItem.display_score + belowItem.display_score) / 2;
  } else if (aboveItem) {
    // At bottom - slightly below item above
    newScore = Math.max(aboveItem.display_score - 0.2, 1.0);
  } else if (belowItem) {
    // At top - slightly above item below
    newScore = Math.min(belowItem.display_score + 0.2, 10.0);
  } else {
    // Only item - keep current score
    newScore = movedItem.display_score;
  }

  newScore = Number(newScore.toFixed(1));

  // Update rankings in a single atomic batch operation using RPC
  // This replaces 2N individual updates with a single database call
  const rankingsPayload = enrichedRankings.map((r, i) => ({
    id: r.id,
    rank_position: i + 1,
    display_score: r.id === movedItem.id ? newScore : r.display_score,
  }));

  const { error: rpcError } = await supabase.rpc('reorder_rankings_batch', {
    p_user_id: userId,
    p_content_type: contentType,
    p_rankings: rankingsPayload,
  });

  if (rpcError) {
    console.error('Error in reorder_rankings_batch RPC:', rpcError);
    throw new Error(`Failed to reorder rankings: ${rpcError.message}`);
  }

  // Update star rating in activity_log if changed (AUTO PROMOTION/DEMOTION)
  if (newStarRating !== movedItem.star_rating && movedItem.content_id) {
    const { error: starUpdateError } = await supabase
      .from('activity_log')
      .update({ star_rating: newStarRating })
      .eq('user_id', userId)
      .eq('content_id', movedItem.content_id)
      .eq('status', 'completed');

    if (starUpdateError) {
      console.error('Error updating star rating:', starUpdateError);
    }
  }

  // Fix any score inversions after reordering
  await ensureScoreMonotonicity(userId, contentType);
}

/**
 * Remove a ranking and shift positions to close gap.
 * PRESERVES existing scores - does NOT trigger full renormalization.
 * This prevents large score shifts when deleting an item.
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

  // Shift rankings below the deleted position up (only within same content_type)
  // NOTE: We only update rank_position, NOT display_score - preserving existing scores
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

  // DO NOT call recalculateAllScores - preserve existing scores
  // This prevents large score shifts when deleting an item
}

/**
 * Delete a ranking along with all associated data (activity, review)
 * Performs a "clean slate" deletion for the user
 */
export async function deleteRankingWithActivity(
  userId: string,
  tmdbId: number,
  contentType: ContentType
): Promise<boolean> {
  try {
    // 1. Remove ranking (handles position shifting)
    await removeRanking(userId, tmdbId, contentType);

    // 2. Get content ID for activity lookup
    const { data: content } = await supabase
      .from('content')
      .select('id')
      .eq('tmdb_id', tmdbId)
      .eq('content_type', contentType)
      .single();

    if (content) {
      // 3. Get ALL activity IDs for this content (both completed and in_progress)
      const { data: activities } = await supabase
        .from('activity_log')
        .select('id')
        .eq('user_id', userId)
        .eq('content_id', content.id);

      const activityIds = activities?.map(a => a.id) || [];

      if (activityIds.length > 0) {
        // 4. Delete likes for these activities
        await supabase
          .from('likes')
          .delete()
          .in('activity_id', activityIds);

        // 5. Delete comments on these activities
        await supabase
          .from('comments')
          .delete()
          .in('activity_id', activityIds);

        // 6. Delete ALL activities (both 'completed' AND 'in_progress')
        await supabase
          .from('activity_log')
          .delete()
          .eq('user_id', userId)
          .eq('content_id', content.id);
      }
    }

    // 7. Delete legacy review if exists (uses movie_id which is tmdb_id)
    await supabase
      .from('reviews')
      .delete()
      .eq('user_id', userId)
      .eq('movie_id', tmdbId);

    return true;
  } catch (error) {
    console.error('Error in deleteRankingWithActivity:', error);
    return false;
  }
}
