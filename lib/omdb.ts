import { ExternalRatings } from '@/types';

const OMDB_API_KEY = process.env.EXPO_PUBLIC_OMDB_API_KEY;
const OMDB_BASE_URL = 'https://www.omdbapi.com';

// Simple in-memory cache (clears on app restart)
const ratingsCache = new Map<string, { data: ExternalRatings | null; timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

interface OMDbResponse {
  imdbRating?: string;
  imdbVotes?: string;
  Ratings?: Array<{ Source: string; Value: string }>;
  Metascore?: string;
  Response: string;
  Error?: string;
}

/**
 * Fetch external ratings (IMDb, Rotten Tomatoes, Metascore) from OMDb API
 * Results are cached in-memory for 24 hours to reduce API calls
 * @param imdbId - The IMDb ID (e.g., "tt0111161")
 * @returns ExternalRatings object or null if not available
 */
export async function getExternalRatings(imdbId: string): Promise<ExternalRatings | null> {
  if (!OMDB_API_KEY || !imdbId) {
    return null;
  }

  // Check cache first
  const cached = ratingsCache.get(imdbId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const response = await fetch(
      `${OMDB_BASE_URL}/?i=${imdbId}&apikey=${OMDB_API_KEY}`
    );
    const data: OMDbResponse = await response.json();

    if (data.Response !== 'True') {
      console.log('OMDb API error:', data.Error);
      // Cache null result to avoid repeated failed requests
      ratingsCache.set(imdbId, { data: null, timestamp: Date.now() });
      return null;
    }

    // Extract Rotten Tomatoes from Ratings array
    const rtRating = data.Ratings?.find((r) => r.Source === 'Rotten Tomatoes');

    const result: ExternalRatings = {
      imdb:
        data.imdbRating && data.imdbRating !== 'N/A'
          ? {
              rating: data.imdbRating,
              votes: data.imdbVotes || '',
            }
          : undefined,
      rottenTomatoes: rtRating
        ? {
            score: rtRating.Value,
          }
        : undefined,
      metascore: data.Metascore && data.Metascore !== 'N/A' ? data.Metascore : undefined,
    };

    // Store in cache
    ratingsCache.set(imdbId, { data: result, timestamp: Date.now() });

    return result;
  } catch (error) {
    console.error('Error fetching OMDb ratings:', error);
    return null;
  }
}
