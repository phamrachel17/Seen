import { ExternalRatings } from '@/types';

const OMDB_API_KEY = process.env.EXPO_PUBLIC_OMDB_API_KEY;
const OMDB_BASE_URL = 'https://www.omdbapi.com';

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
 * @param imdbId - The IMDb ID (e.g., "tt0111161")
 * @returns ExternalRatings object or null if not available
 */
export async function getExternalRatings(imdbId: string): Promise<ExternalRatings | null> {
  if (!OMDB_API_KEY || !imdbId) {
    return null;
  }

  try {
    const response = await fetch(
      `${OMDB_BASE_URL}/?i=${imdbId}&apikey=${OMDB_API_KEY}`
    );
    const data: OMDbResponse = await response.json();

    if (data.Response !== 'True') {
      console.log('OMDb API error:', data.Error);
      return null;
    }

    // Extract Rotten Tomatoes from Ratings array
    const rtRating = data.Ratings?.find((r) => r.Source === 'Rotten Tomatoes');

    return {
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
  } catch (error) {
    console.error('Error fetching OMDb ratings:', error);
    return null;
  }
}
