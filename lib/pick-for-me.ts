import { supabase } from './supabase';
import {
  ContentType,
  Movie,
  TVShow,
  PickFilters,
  PickSuggestion,
  PickScoreBreakdown,
  PickExplanation,
  PickOutcome,
  PickForMeResult,
  PickMood,
  PickTimeCommitment,
} from '@/types';
import { getFollowingIds } from './follows';
import {
  getTrendingMovies,
  getTrendingTVShows,
  discoverMoviesByGenres,
  discoverTVShowsByGenre,
  GENRE_IDS,
} from './tmdb';
import { getUserTopGenres } from './recommendations';
import { ensureContentExists } from './content';

// ============================================
// CONSTANTS & WEIGHTS
// ============================================

const SCORE_WEIGHTS = {
  GENRE_MATCH: 3.0,
  FRIEND_WATCHED: 2.0,
  FRIEND_HIGH_RATING: 4.0,
  FRIEND_LOVED: 6.0,
  USER_HISTORY_GENRE: 2.5,
  TRENDING: 1.5,
  RECENT_RELEASE: 1.0,
  RECENTLY_SUGGESTED: -10.0,
  RANDOM_BOOST_MAX: 2.0,
} as const;

// Mood to genre mapping
const MOOD_GENRES: Record<PickMood, string[]> = {
  intense: ['Action', 'Thriller', 'Horror', 'Crime'],
  chill: ['Comedy', 'Romance', 'Animation', 'Family'],
  thoughtful: ['Drama', 'Documentary', 'Mystery', 'History'],
  fun: ['Comedy', 'Animation', 'Adventure', 'Fantasy'],
};

// Time commitment to runtime mapping (in minutes)
const TIME_COMMITMENT: Record<PickTimeCommitment, { min: number; max: number }> = {
  quick: { min: 0, max: 100 },
  standard: { min: 90, max: 140 },
  epic: { min: 140, max: 999 },
};

// Genre string to TMDB ID mapping
const GENRE_NAME_TO_ID: Record<string, number> = {
  action: GENRE_IDS.action,
  comedy: GENRE_IDS.comedy,
  drama: GENRE_IDS.drama,
  horror: GENRE_IDS.horror,
  romance: GENRE_IDS.romance,
  'sci-fi': GENRE_IDS.scifi,
  thriller: GENRE_IDS.thriller,
  documentary: GENRE_IDS.documentary,
  animation: GENRE_IDS.animation,
  crime: GENRE_IDS.crime,
  mystery: GENRE_IDS.mystery,
  fantasy: GENRE_IDS.fantasy,
};

// ============================================
// TYPES
// ============================================

interface ContentCandidate {
  content: Movie | TVShow;
  tmdbId: number;
  contentType: ContentType;
  genres: string[];
  runtime?: number;
  releaseYear: number;
  popularityScore: number;
}

interface ScoredCandidate extends ContentCandidate {
  score: number;
  breakdown: PickScoreBreakdown;
  friendActivity?: FriendActivity;
}

interface FriendActivity {
  userId: string;
  username: string;
  contentId: number;
  tmdbId: number;
  starRating?: number;
  watchDate?: string;
}

interface ScoringContext {
  watchedTmdbIds: Set<number>;
  recentSuggestionTmdbIds: Set<number>;
  friendsActivities: FriendActivity[];
  userTopGenres: string[];
  filters: PickFilters;
}

// ============================================
// MAIN PICK FUNCTION
// ============================================

export async function getPickForMe(
  userId: string,
  filters: PickFilters,
  sessionId: string
): Promise<PickForMeResult | null> {
  try {
    // 1. Gather user context in parallel
    const [
      watchedTmdbIds,
      recentSuggestionTmdbIds,
      friendsActivities,
      userTopGenresData,
    ] = await Promise.all([
      getUserWatchedTmdbIds(userId),
      getRecentSuggestionTmdbIds(userId, 7),
      getFriendsRecentActivities(userId),
      getUserTopGenres(userId, 5),
    ]);

    const userTopGenres = userTopGenresData.map((g) => g.genre);

    // 2. Get candidate content from multiple sources
    let candidates = await gatherCandidates(filters, watchedTmdbIds);

    // 2b. Apply strict genre filtering if genres are selected
    if (filters.genres && filters.genres.length > 0) {
      candidates = candidates.filter(candidate =>
        candidate.genres.some(g =>
          filters.genres!.some(fg => fg.toLowerCase() === g.toLowerCase())
        )
      );
    }

    if (candidates.length === 0) {
      return null;
    }

    // 3. Score each candidate
    const scoredCandidates = scoreCandidates(candidates, {
      watchedTmdbIds,
      recentSuggestionTmdbIds,
      friendsActivities,
      userTopGenres,
      filters,
    });

    // 4. Filter by time commitment if specified
    const filteredCandidates = filterByTimeCommitment(
      scoredCandidates,
      filters.timeCommitment
    );

    if (filteredCandidates.length === 0) {
      return null;
    }

    // 5. Select top candidate (with slight randomness in top 5)
    const topCandidates = filteredCandidates.slice(0, 5);
    const selectedIndex = weightedRandomSelect(topCandidates.length);
    const selected = topCandidates[selectedIndex];

    // 6. Generate explanation
    const explanation = generateExplanation(selected);

    // 7. Save to database
    const suggestion = await saveSuggestion(
      userId,
      selected,
      sessionId,
      filters,
      explanation
    );

    if (!suggestion) {
      return null;
    }

    return {
      suggestion,
      alternatesAvailable: filteredCandidates.length > 1,
    };
  } catch (error) {
    console.error('Error in getPickForMe:', error);
    return null;
  }
}

// ============================================
// CANDIDATE GATHERING
// ============================================

async function gatherCandidates(
  filters: PickFilters,
  watchedTmdbIds: Set<number>
): Promise<ContentCandidate[]> {
  const candidates: ContentCandidate[] = [];
  const seenIds = new Set<number>();

  // Determine which genres to fetch
  let targetGenres = filters.genres || [];

  // Add mood-based genres if mood is specified
  if (filters.mood) {
    const moodGenres = MOOD_GENRES[filters.mood];
    targetGenres = [...new Set([...targetGenres, ...moodGenres])];
  }

  // Convert genre names to TMDB IDs
  const genreIds = targetGenres
    .map((g) => GENRE_NAME_TO_ID[g.toLowerCase()])
    .filter(Boolean);

  if (filters.contentType === 'movie') {
    // Source 1: Trending movies
    const trending = await getTrendingMovies();
    for (const movie of trending) {
      if (!watchedTmdbIds.has(movie.id) && !seenIds.has(movie.id)) {
        seenIds.add(movie.id);
        candidates.push({
          content: movie,
          tmdbId: movie.id,
          contentType: 'movie',
          genres: movie.genres || [],
          runtime: movie.runtime_minutes,
          releaseYear: movie.release_year,
          popularityScore: movie.popularity_score,
        });
      }
    }

    // Source 2: Genre-specific discover (if genres specified)
    if (genreIds.length > 0) {
      const genreMovies = await discoverMoviesByGenres(genreIds);
      for (const movie of genreMovies) {
        if (!watchedTmdbIds.has(movie.id) && !seenIds.has(movie.id)) {
          seenIds.add(movie.id);
          candidates.push({
            content: movie,
            tmdbId: movie.id,
            contentType: 'movie',
            genres: movie.genres || [],
            runtime: movie.runtime_minutes,
            releaseYear: movie.release_year,
            popularityScore: movie.popularity_score,
          });
        }
      }
    }
  } else {
    // TV Shows
    const trending = await getTrendingTVShows();
    for (const show of trending) {
      if (!watchedTmdbIds.has(show.id) && !seenIds.has(show.id)) {
        seenIds.add(show.id);
        candidates.push({
          content: show,
          tmdbId: show.id,
          contentType: 'tv',
          genres: show.genres || [],
          runtime: show.episode_runtime,
          releaseYear: show.release_year,
          popularityScore: show.popularity_score,
        });
      }
    }

    // Source 2: Genre-specific discover for TV (if genres specified)
    if (genreIds.length > 0) {
      // Fetch TV shows for each selected genre (up to 3) and combine
      const tvGenrePromises = genreIds.slice(0, 3).map(id => discoverTVShowsByGenre(id));
      const tvGenreResultsArrays = await Promise.all(tvGenrePromises);
      const genreShows = tvGenreResultsArrays.flat();

      for (const show of genreShows) {
        if (!watchedTmdbIds.has(show.id) && !seenIds.has(show.id)) {
          seenIds.add(show.id);
          candidates.push({
            content: show,
            tmdbId: show.id,
            contentType: 'tv',
            genres: show.genres || [],
            runtime: show.episode_runtime,
            releaseYear: show.release_year,
            popularityScore: show.popularity_score,
          });
        }
      }
    }
  }

  return candidates;
}

// ============================================
// SCORING ENGINE
// ============================================

function scoreCandidates(
  candidates: ContentCandidate[],
  context: ScoringContext
): ScoredCandidate[] {
  // Build lookup for friend activities by TMDB ID
  const friendActivityMap = new Map<number, FriendActivity>();
  for (const activity of context.friendsActivities) {
    const existing = friendActivityMap.get(activity.tmdbId);
    if (!existing || (activity.starRating || 0) > (existing.starRating || 0)) {
      friendActivityMap.set(activity.tmdbId, activity);
    }
  }

  const scored: ScoredCandidate[] = candidates.map((candidate) => {
    const breakdown: PickScoreBreakdown = {
      genreMatch: 0,
      friendWatched: 0,
      friendHighRating: 0,
      userHistoryMatch: 0,
      trending: 0,
      recentRelease: 0,
      randomBoost: 0,
    };

    // Genre matching (user-selected genres)
    if (context.filters.genres && context.filters.genres.length > 0) {
      const matchCount = candidate.genres.filter((g) =>
        context.filters.genres!.some(
          (fg) => fg.toLowerCase() === g.toLowerCase()
        )
      ).length;
      breakdown.genreMatch = matchCount * SCORE_WEIGHTS.GENRE_MATCH;
    }

    // User history genre match
    const historyMatchCount = candidate.genres.filter((g) =>
      context.userTopGenres.some((ug) => ug.toLowerCase() === g.toLowerCase())
    ).length;
    breakdown.userHistoryMatch =
      historyMatchCount * SCORE_WEIGHTS.USER_HISTORY_GENRE;

    // Friend activity scoring
    const friendActivity = friendActivityMap.get(candidate.tmdbId);
    let friendActivityRef: FriendActivity | undefined;

    if (friendActivity) {
      friendActivityRef = friendActivity;
      breakdown.friendWatched = SCORE_WEIGHTS.FRIEND_WATCHED;

      if (friendActivity.starRating) {
        if (friendActivity.starRating === 5) {
          breakdown.friendHighRating = SCORE_WEIGHTS.FRIEND_LOVED;
        } else if (friendActivity.starRating >= 4) {
          breakdown.friendHighRating = SCORE_WEIGHTS.FRIEND_HIGH_RATING;
        }
      }
    }

    // Trending boost (based on popularity score)
    if (candidate.popularityScore > 50) {
      breakdown.trending = SCORE_WEIGHTS.TRENDING;
    }

    // Recent release boost
    const currentYear = new Date().getFullYear();
    if (candidate.releaseYear >= currentYear - 2) {
      breakdown.recentRelease = SCORE_WEIGHTS.RECENT_RELEASE;
    }

    // Penalty for recently suggested
    if (context.recentSuggestionTmdbIds.has(candidate.tmdbId)) {
      breakdown.randomBoost = SCORE_WEIGHTS.RECENTLY_SUGGESTED;
    } else {
      // Add controlled randomness
      breakdown.randomBoost = Math.random() * SCORE_WEIGHTS.RANDOM_BOOST_MAX;
    }

    // Calculate total score
    const totalScore = Object.values(breakdown).reduce(
      (sum, val) => sum + val,
      0
    );

    return {
      ...candidate,
      score: totalScore,
      breakdown,
      friendActivity: friendActivityRef,
    };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  return scored;
}

// ============================================
// FILTERING
// ============================================

function filterByTimeCommitment(
  candidates: ScoredCandidate[],
  timeCommitment?: PickTimeCommitment
): ScoredCandidate[] {
  if (!timeCommitment) return candidates;

  const { min, max } = TIME_COMMITMENT[timeCommitment];

  return candidates.filter((c) => {
    if (!c.runtime) return true; // Include if no runtime data
    return c.runtime >= min && c.runtime <= max;
  });
}

// ============================================
// SELECTION WITH RANDOMNESS
// ============================================

function weightedRandomSelect(count: number): number {
  if (count <= 1) return 0;

  // Give higher weight to top candidates
  const weights = [5, 3, 2, 1, 1].slice(0, count);
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  let random = Math.random() * totalWeight;
  for (let i = 0; i < weights.length; i++) {
    random -= weights[i];
    if (random <= 0) return i;
  }

  return 0;
}

// ============================================
// EXPLANATION GENERATION
// ============================================

function generateExplanation(candidate: ScoredCandidate): PickExplanation {
  // Priority 1: Friend loved it (5 stars)
  if (candidate.friendActivity?.starRating === 5) {
    return {
      type: 'friend_loved',
      text: `Because ${candidate.friendActivity.username} loved it`,
      friendName: candidate.friendActivity.username,
      friendRating: 5,
    };
  }

  // Priority 2: Friend watched and rated highly
  if (
    candidate.friendActivity?.starRating &&
    candidate.friendActivity.starRating >= 4
  ) {
    return {
      type: 'friend_watched',
      text: `${candidate.friendActivity.username} gave it ${candidate.friendActivity.starRating} stars`,
      friendName: candidate.friendActivity.username,
      friendRating: candidate.friendActivity.starRating,
    };
  }

  // Priority 3: Friend watched (no rating or lower rating)
  if (candidate.friendActivity) {
    return {
      type: 'friend_watched',
      text: `${candidate.friendActivity.username} watched this`,
      friendName: candidate.friendActivity.username,
    };
  }

  // Priority 4: Strong genre match from user history
  if (candidate.breakdown.userHistoryMatch > 0) {
    const topGenre = candidate.genres[0];
    return {
      type: 'genre_match',
      text: `Because you like ${topGenre}`,
      matchedGenres: candidate.genres.slice(0, 2),
    };
  }

  // Priority 5: Trending
  if (candidate.breakdown.trending > 0) {
    return {
      type: 'trending',
      text: 'Trending now',
    };
  }

  // Priority 6: Recent release
  if (candidate.breakdown.recentRelease > 0) {
    return {
      type: 'highly_rated',
      text: 'New this week',
    };
  }

  // Default: Hidden gem
  return {
    type: 'hidden_gem',
    text: 'Hidden gem',
  };
}

// ============================================
// DATA FETCHING HELPERS
// ============================================

async function getUserWatchedTmdbIds(userId: string): Promise<Set<number>> {
  const { data, error } = await supabase
    .from('activity_log')
    .select(
      `
      content:content_id (tmdb_id)
    `
    )
    .eq('user_id', userId)
    .eq('status', 'completed');

  if (error || !data) return new Set();

  const ids = data
    .map((a: { content: { tmdb_id: number } | null }) => a.content?.tmdb_id)
    .filter(Boolean) as number[];

  return new Set(ids);
}

async function getRecentSuggestionTmdbIds(
  userId: string,
  days: number
): Promise<Set<number>> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabase
    .from('pick_suggestions')
    .select(
      `
      content:content_id (tmdb_id)
    `
    )
    .eq('user_id', userId)
    .gte('created_at', since.toISOString());

  if (error || !data) return new Set();

  const ids = data
    .map((s: { content: { tmdb_id: number } | null }) => s.content?.tmdb_id)
    .filter(Boolean) as number[];

  return new Set(ids);
}

async function getFriendsRecentActivities(
  userId: string
): Promise<FriendActivity[]> {
  const followingIds = await getFollowingIds(userId);
  if (followingIds.length === 0) return [];

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const { data, error } = await supabase
    .from('activity_log')
    .select(
      `
      user_id,
      star_rating,
      watch_date,
      content:content_id (id, tmdb_id),
      user:user_id (username)
    `
    )
    .in('user_id', followingIds)
    .eq('status', 'completed')
    .eq('is_private', false)
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false });

  if (error || !data) return [];

  return data
    .filter(
      (a: {
        content: { id: number; tmdb_id: number } | null;
        user: { username: string } | null;
      }) => a.content?.tmdb_id
    )
    .map(
      (a: {
        user_id: string;
        star_rating: number | null;
        watch_date: string | null;
        content: { id: number; tmdb_id: number };
        user: { username: string } | null;
      }) => ({
        userId: a.user_id,
        username: a.user?.username || 'Friend',
        contentId: a.content.id,
        tmdbId: a.content.tmdb_id,
        starRating: a.star_rating || undefined,
        watchDate: a.watch_date || undefined,
      })
    );
}

// ============================================
// PERSISTENCE
// ============================================

async function saveSuggestion(
  userId: string,
  candidate: ScoredCandidate,
  sessionId: string,
  filters: PickFilters,
  explanation: PickExplanation
): Promise<PickSuggestion | null> {
  // Ensure content exists in database
  const content = await ensureContentExists(
    candidate.tmdbId,
    candidate.contentType
  );

  if (!content) {
    console.error('Failed to ensure content exists');
    return null;
  }

  const { data, error } = await supabase
    .from('pick_suggestions')
    .insert({
      user_id: userId,
      content_id: content.id,
      content_type: candidate.contentType,
      session_id: sessionId,
      filter_genres: filters.genres,
      filter_mood: filters.mood,
      filter_time_commitment: filters.timeCommitment,
      score_breakdown: candidate.breakdown,
      total_score: candidate.score,
      outcome: 'pending',
      explanation_type: explanation.type,
      explanation_data: {
        text: explanation.text,
        friendName: explanation.friendName,
        friendRating: explanation.friendRating,
        matchedGenres: explanation.matchedGenres,
      },
    })
    .select()
    .single();

  if (error) {
    console.error('Error saving pick suggestion:', error);
    return null;
  }

  return {
    id: data.id,
    contentId: content.id,
    contentType: candidate.contentType,
    sessionId,
    content: candidate.content,
    scoreBreakdown: candidate.breakdown,
    totalScore: candidate.score,
    explanation,
    outcome: 'pending',
    createdAt: data.created_at,
  };
}

// ============================================
// OUTCOME TRACKING
// ============================================

export async function updatePickOutcome(
  suggestionId: string,
  outcome: PickOutcome
): Promise<void> {
  const { error } = await supabase
    .from('pick_suggestions')
    .update({
      outcome,
      outcome_at: new Date().toISOString(),
    })
    .eq('id', suggestionId);

  if (error) {
    console.error('Error updating pick outcome:', error);
  }
}

// ============================================
// UTILITY: Generate Session ID
// ============================================

export function generateSessionId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
