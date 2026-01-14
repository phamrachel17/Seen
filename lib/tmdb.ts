import { Movie } from '@/types';

const TMDB_API_KEY = process.env.EXPO_PUBLIC_TMDB_API_KEY ?? '';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

// Image size variants
export const ImageSize = {
  poster: {
    small: 'w185',
    medium: 'w342',
    large: 'w500',
    original: 'original',
  },
  backdrop: {
    small: 'w300',
    medium: 'w780',
    large: 'w1280',
    original: 'original',
  },
} as const;

// TMDB API response types
interface TMDBMovie {
  id: number;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  genre_ids?: number[];
  genres?: { id: number; name: string }[];
  overview: string;
  popularity: number;
  runtime?: number;
  vote_average: number;
}

interface TMDBCredits {
  crew: {
    id: number;
    name: string;
    job: string;
  }[];
}

interface TMDBSearchResponse {
  page: number;
  results: TMDBMovie[];
  total_pages: number;
  total_results: number;
}

// Helper to build image URLs
export function getImageUrl(
  path: string | null,
  type: 'poster' | 'backdrop' = 'poster',
  size: keyof typeof ImageSize.poster = 'medium'
): string {
  if (!path) {
    return '';
  }
  const sizeKey = ImageSize[type][size as keyof (typeof ImageSize)[typeof type]];
  return `${TMDB_IMAGE_BASE}/${sizeKey}${path}`;
}

// Transform TMDB movie to our Movie type
function transformMovie(tmdbMovie: TMDBMovie, director?: string): Movie {
  return {
    id: tmdbMovie.id,
    title: tmdbMovie.title,
    poster_url: getImageUrl(tmdbMovie.poster_path, 'poster', 'medium'),
    backdrop_url: getImageUrl(tmdbMovie.backdrop_path, 'backdrop', 'medium'),
    release_year: tmdbMovie.release_date
      ? parseInt(tmdbMovie.release_date.split('-')[0], 10)
      : 0,
    genres: tmdbMovie.genres?.map((g) => g.name) ?? [],
    director: director,
    synopsis: tmdbMovie.overview,
    popularity_score: tmdbMovie.popularity,
    runtime_minutes: tmdbMovie.runtime,
  };
}

// API request helper
async function tmdbFetch<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
  if (!TMDB_API_KEY) {
    throw new Error('TMDB API key is not configured. Add EXPO_PUBLIC_TMDB_API_KEY to your .env file.');
  }

  const url = new URL(`${TMDB_BASE_URL}${endpoint}`);
  url.searchParams.append('api_key', TMDB_API_KEY);

  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.append(key, value);
  });

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`TMDB API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

// Search movies by query
export async function searchMovies(query: string, page: number = 1): Promise<{
  movies: Movie[];
  totalPages: number;
  totalResults: number;
}> {
  if (!query.trim()) {
    return { movies: [], totalPages: 0, totalResults: 0 };
  }

  const data = await tmdbFetch<TMDBSearchResponse>('/search/movie', {
    query: query.trim(),
    page: page.toString(),
    include_adult: 'false',
  });

  return {
    movies: data.results.map((m) => transformMovie(m)),
    totalPages: data.total_pages,
    totalResults: data.total_results,
  };
}

// Get movie details by ID (includes director from credits)
export async function getMovieDetails(movieId: number): Promise<Movie> {
  // Fetch movie details and credits in parallel
  const [movieData, creditsData] = await Promise.all([
    tmdbFetch<TMDBMovie>(`/movie/${movieId}`),
    tmdbFetch<TMDBCredits>(`/movie/${movieId}/credits`),
  ]);

  // Find director from credits
  const director = creditsData.crew.find((c) => c.job === 'Director')?.name;

  return transformMovie(movieData, director);
}

// Get popular movies
export async function getPopularMovies(page: number = 1): Promise<{
  movies: Movie[];
  totalPages: number;
}> {
  const data = await tmdbFetch<TMDBSearchResponse>('/movie/popular', {
    page: page.toString(),
  });

  return {
    movies: data.results.map((m) => transformMovie(m)),
    totalPages: data.total_pages,
  };
}

// Get trending movies (this week)
export async function getTrendingMovies(): Promise<Movie[]> {
  const data = await tmdbFetch<TMDBSearchResponse>('/trending/movie/week');
  return data.results.map((m) => transformMovie(m));
}

// Get now playing movies
export async function getNowPlayingMovies(page: number = 1): Promise<{
  movies: Movie[];
  totalPages: number;
}> {
  const data = await tmdbFetch<TMDBSearchResponse>('/movie/now_playing', {
    page: page.toString(),
  });

  return {
    movies: data.results.map((m) => transformMovie(m)),
    totalPages: data.total_pages,
  };
}
