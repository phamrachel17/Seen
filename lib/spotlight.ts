import { Movie, TVShow } from '@/types';
import { getTrendingMovies, getNowPlayingMovies, getTrendingTVShows, getPopularTVShows } from './tmdb';

export interface SpotlightContent {
  movie: Movie;
  source: 'trending' | 'new_release';
}

export interface TVSpotlightContent {
  show: TVShow;
  source: 'trending' | 'popular';
}

export interface SpotlightList {
  items: SpotlightContent[];
  currentIndex: number;
}

export interface TVSpotlightList {
  items: TVSpotlightContent[];
  currentIndex: number;
}

// Session cache to avoid flickering on re-renders
let cachedMovieSpotlight: SpotlightContent | null = null;
let cachedMovieSpotlightList: SpotlightList | null = null;
let cachedTVSpotlight: TVSpotlightContent | null = null;
let cachedTVSpotlightList: TVSpotlightList | null = null;
let movieCacheTimestamp: number = 0;
let tvCacheTimestamp: number = 0;
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const MAX_SPOTLIGHT_ITEMS = 5; // Number of items to rotate through

// Get spotlight content - purely trending-based (no personalization)
export async function getSpotlightContent(): Promise<SpotlightContent | null> {
  // Return cached content if still valid
  const now = Date.now();
  if (cachedMovieSpotlight && now - movieCacheTimestamp < CACHE_DURATION_MS) {
    return cachedMovieSpotlight;
  }

  try {
    // Simple 60% trending, 40% new releases (no personalization)
    const random = Math.random();
    let source: 'trending' | 'new_release' = random < 0.6 ? 'trending' : 'new_release';
    let candidates: Movie[] = [];

    if (source === 'trending') {
      candidates = await getTrendingMovies();
    }

    // Fallback to new releases if no trending
    if (candidates.length === 0) {
      source = 'new_release';
      const { movies } = await getNowPlayingMovies();
      candidates = movies;
    }

    if (candidates.length === 0) {
      return null;
    }

    // Pick the top candidate (already sorted by popularity)
    const selectedMovie = candidates[0];

    const spotlight: SpotlightContent = {
      movie: selectedMovie,
      source,
    };

    // Cache the result
    cachedMovieSpotlight = spotlight;
    movieCacheTimestamp = now;

    return spotlight;
  } catch (error) {
    console.error('Error getting spotlight content:', error);
    return null;
  }
}

// Get TV spotlight content - purely trending-based (no personalization)
export async function getTVSpotlightContent(): Promise<TVSpotlightContent | null> {
  // Return cached content if still valid
  const now = Date.now();
  if (cachedTVSpotlight && now - tvCacheTimestamp < CACHE_DURATION_MS) {
    return cachedTVSpotlight;
  }

  try {
    // 60% trending, 40% popular (no personalization)
    const random = Math.random();
    let source: 'trending' | 'popular' = random < 0.6 ? 'trending' : 'popular';

    let candidates: TVShow[] = [];

    if (source === 'trending') {
      candidates = await getTrendingTVShows();
    }

    // Fallback to popular if no trending
    if (candidates.length === 0) {
      source = 'popular';
      const { shows } = await getPopularTVShows();
      candidates = shows;
    }

    if (candidates.length === 0) {
      return null;
    }

    // Pick the top candidate (already sorted by popularity)
    const selectedShow = candidates[0];

    const spotlight: TVSpotlightContent = {
      show: selectedShow,
      source,
    };

    // Cache the result
    cachedTVSpotlight = spotlight;
    tvCacheTimestamp = now;

    return spotlight;
  } catch (error) {
    console.error('Error getting TV spotlight content:', error);
    return null;
  }
}

// Get multiple spotlight items for rotation - purely trending-based (no personalization)
export async function getSpotlightList(): Promise<SpotlightList | null> {
  // Return cached list if still valid
  const now = Date.now();
  if (cachedMovieSpotlightList && now - movieCacheTimestamp < CACHE_DURATION_MS) {
    return cachedMovieSpotlightList;
  }

  try {
    // Fetch from trending and new releases only (no personalization)
    const [trending, nowPlaying] = await Promise.all([
      getTrendingMovies(),
      getNowPlayingMovies().then(r => r.movies),
    ]);

    // Combine and dedupe candidates
    const seen = new Set<number>();
    const items: SpotlightContent[] = [];

    // Add trending first (highest priority for global spotlight)
    for (const movie of trending) {
      if (!seen.has(movie.id)) {
        seen.add(movie.id);
        items.push({ movie, source: 'trending' });
        if (items.length >= MAX_SPOTLIGHT_ITEMS) break;
      }
    }

    // Add new releases
    for (const movie of nowPlaying) {
      if (items.length >= MAX_SPOTLIGHT_ITEMS) break;
      if (!seen.has(movie.id)) {
        seen.add(movie.id);
        items.push({ movie, source: 'new_release' });
      }
    }

    if (items.length === 0) {
      return null;
    }

    const list: SpotlightList = {
      items,
      currentIndex: 0,
    };

    cachedMovieSpotlightList = list;
    movieCacheTimestamp = now;

    return list;
  } catch (error) {
    console.error('Error getting spotlight list:', error);
    return null;
  }
}

// Get multiple TV spotlight items for rotation - purely trending-based (no personalization)
export async function getTVSpotlightList(): Promise<TVSpotlightList | null> {
  // Return cached list if still valid
  const now = Date.now();
  if (cachedTVSpotlightList && now - tvCacheTimestamp < CACHE_DURATION_MS) {
    return cachedTVSpotlightList;
  }

  try {
    // Fetch from trending and popular only (no personalization)
    const [trending, popular] = await Promise.all([
      getTrendingTVShows(),
      getPopularTVShows().then(r => r.shows),
    ]);

    // Combine and dedupe candidates
    const seen = new Set<number>();
    const items: TVSpotlightContent[] = [];

    // Add trending first (highest priority for global spotlight)
    for (const show of trending) {
      if (!seen.has(show.id)) {
        seen.add(show.id);
        items.push({ show, source: 'trending' });
        if (items.length >= MAX_SPOTLIGHT_ITEMS) break;
      }
    }

    // Add popular
    for (const show of popular) {
      if (items.length >= MAX_SPOTLIGHT_ITEMS) break;
      if (!seen.has(show.id)) {
        seen.add(show.id);
        items.push({ show, source: 'popular' });
      }
    }

    if (items.length === 0) {
      return null;
    }

    const list: TVSpotlightList = {
      items,
      currentIndex: 0,
    };

    cachedTVSpotlightList = list;
    tvCacheTimestamp = now;

    return list;
  } catch (error) {
    console.error('Error getting TV spotlight list:', error);
    return null;
  }
}

// Clear the spotlight cache (useful when user logs in/out or watches something)
export function clearSpotlightCache(): void {
  cachedMovieSpotlight = null;
  cachedMovieSpotlightList = null;
  cachedTVSpotlight = null;
  cachedTVSpotlightList = null;
  movieCacheTimestamp = 0;
  tvCacheTimestamp = 0;
}
