import { Movie, MovieDetails, CastMember, CrewMember, TVShow, TVShowDetails, Season, Episode, Person } from '@/types';

const TMDB_API_KEY = process.env.EXPO_PUBLIC_TMDB_API_KEY ?? '';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

// Genre ID mapping for TMDB discover API
export const GENRE_IDS = {
  action: 28,
  comedy: 35,
  drama: 18,
  horror: 27,
  romance: 10749,
  scifi: 878,
  thriller: 53,
  documentary: 99,
  animation: 16,
  crime: 80,
  mystery: 9648,
  fantasy: 14,
} as const;

export type GenreKey = keyof typeof GENRE_IDS;

// Reverse mapping: TMDB movie genre IDs to genre names
const MOVIE_GENRE_ID_TO_NAME: Record<number, string> = {
  28: 'Action',
  12: 'Adventure',
  16: 'Animation',
  35: 'Comedy',
  80: 'Crime',
  99: 'Documentary',
  18: 'Drama',
  10751: 'Family',
  14: 'Fantasy',
  36: 'History',
  27: 'Horror',
  10402: 'Music',
  9648: 'Mystery',
  10749: 'Romance',
  878: 'Sci-Fi',
  10770: 'TV Movie',
  53: 'Thriller',
  10752: 'War',
  37: 'Western',
};

// Reverse mapping: TMDB TV genre IDs to genre names
const TV_GENRE_ID_TO_NAME: Record<number, string> = {
  10759: 'Action & Adventure',
  16: 'Animation',
  35: 'Comedy',
  80: 'Crime',
  99: 'Documentary',
  18: 'Drama',
  10751: 'Family',
  10762: 'Kids',
  9648: 'Mystery',
  10763: 'News',
  10764: 'Reality',
  10765: 'Sci-Fi & Fantasy',
  10766: 'Soap',
  10767: 'Talk',
  10768: 'War & Politics',
  37: 'Western',
};

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
interface TMDBCollection {
  id: number;
  name: string;
  poster_path: string | null;
  backdrop_path: string | null;
}

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
  belongs_to_collection?: TMDBCollection | null;
  imdb_id?: string;
}

interface TMDBCastMember {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
  order: number;
}

interface TMDBCrewMember {
  id: number;
  name: string;
  job: string;
  department: string;
  profile_path: string | null;
}

interface TMDBCredits {
  cast: TMDBCastMember[];
  crew: TMDBCrewMember[];
}

interface TMDBSearchResponse {
  page: number;
  results: TMDBMovie[];
  total_pages: number;
  total_results: number;
}

// TV Show TMDB types
interface TMDBTVShow {
  id: number;
  name: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  genre_ids?: number[];
  genres?: { id: number; name: string }[];
  overview: string;
  popularity: number;
  vote_average: number;
  number_of_seasons?: number;
  number_of_episodes?: number;
  episode_run_time?: number[];
  created_by?: { id: number; name: string }[];
  seasons?: TMDBSeason[];
}

interface TMDBSeason {
  id: number;
  season_number: number;
  name: string;
  overview: string;
  poster_path: string | null;
  air_date: string;
  episode_count: number;
}

interface TMDBEpisode {
  id: number;
  episode_number: number;
  season_number: number;
  name: string;
  overview: string;
  still_path: string | null;
  air_date: string;
  runtime: number | null;
}

interface TMDBSeasonDetails {
  id: number;
  season_number: number;
  name: string;
  overview: string;
  poster_path: string | null;
  air_date: string;
  episodes: TMDBEpisode[];
}

interface TMDBTVSearchResponse {
  page: number;
  results: TMDBTVShow[];
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

// Helper for profile/person images
export function getProfileImageUrl(path: string | null): string {
  if (!path) return '';
  return `${TMDB_IMAGE_BASE}/w185${path}`;
}

// Transform TMDB movie to our Movie type
function transformMovie(tmdbMovie: TMDBMovie, director?: string): Movie {
  const collection = tmdbMovie.belongs_to_collection;
  // Use genres array if available (from detail endpoints), otherwise convert genre_ids (from list endpoints)
  const genres = tmdbMovie.genres?.map((g) => g.name)
    ?? tmdbMovie.genre_ids?.map(id => MOVIE_GENRE_ID_TO_NAME[id]).filter((g): g is string => !!g)
    ?? [];

  return {
    id: tmdbMovie.id,
    title: tmdbMovie.title,
    poster_url: getImageUrl(tmdbMovie.poster_path, 'poster', 'medium'),
    backdrop_url: getImageUrl(tmdbMovie.backdrop_path, 'backdrop', 'medium'),
    release_year: tmdbMovie.release_date
      ? parseInt(tmdbMovie.release_date.split('-')[0], 10)
      : 0,
    genres,
    director: director,
    synopsis: tmdbMovie.overview,
    popularity_score: tmdbMovie.popularity,
    runtime_minutes: tmdbMovie.runtime,
    collection_id: collection?.id,
    collection_name: collection?.name,
    rating: tmdbMovie.vote_average,
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

// Key crew roles to extract
const KEY_CREW_JOBS = ['Director', 'Writer', 'Screenplay', 'Producer', 'Cinematography', 'Original Music Composer'];

// Get movie details by ID (includes cast/crew from credits)
export async function getMovieDetails(movieId: number): Promise<MovieDetails> {
  // Fetch movie details and credits in parallel
  const [movieData, creditsData] = await Promise.all([
    tmdbFetch<TMDBMovie>(`/movie/${movieId}`),
    tmdbFetch<TMDBCredits>(`/movie/${movieId}/credits`),
  ]);

  // Find director from credits
  const director = creditsData.crew.find((c) => c.job === 'Director')?.name;

  // Extract top 10 cast members sorted by billing order
  const cast: CastMember[] = creditsData.cast
    .sort((a, b) => a.order - b.order)
    .slice(0, 10)
    .map((c) => ({
      id: c.id,
      name: c.name,
      character: c.character,
      profile_url: getProfileImageUrl(c.profile_path),
    }));

  // Extract key crew members (deduplicated by id)
  const seenCrewIds = new Set<number>();
  const crew: CrewMember[] = creditsData.crew
    .filter((c) => KEY_CREW_JOBS.includes(c.job))
    .filter((c) => {
      if (seenCrewIds.has(c.id)) return false;
      seenCrewIds.add(c.id);
      return true;
    })
    .slice(0, 10)
    .map((c) => ({
      id: c.id,
      name: c.name,
      job: c.job,
      department: c.department,
      profile_url: getProfileImageUrl(c.profile_path),
    }));

  return {
    ...transformMovie(movieData, director),
    cast,
    crew,
    imdb_id: movieData.imdb_id,
  };
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

// ============================================
// TV SHOW API FUNCTIONS
// ============================================

// Transform TMDB TV show to our TVShow type
function transformTVShow(tmdbShow: TMDBTVShow, creator?: string): TVShow {
  // Use genres array if available (from detail endpoints), otherwise convert genre_ids (from list endpoints)
  const genres = tmdbShow.genres?.map((g) => g.name)
    ?? tmdbShow.genre_ids?.map(id => TV_GENRE_ID_TO_NAME[id]).filter((g): g is string => !!g)
    ?? [];

  return {
    id: tmdbShow.id,
    title: tmdbShow.name,
    poster_url: getImageUrl(tmdbShow.poster_path, 'poster', 'medium'),
    backdrop_url: getImageUrl(tmdbShow.backdrop_path, 'backdrop', 'medium'),
    release_year: tmdbShow.first_air_date
      ? parseInt(tmdbShow.first_air_date.split('-')[0], 10)
      : 0,
    genres,
    creator: creator,
    synopsis: tmdbShow.overview,
    popularity_score: tmdbShow.popularity,
    total_seasons: tmdbShow.number_of_seasons,
    total_episodes: tmdbShow.number_of_episodes,
    episode_runtime: tmdbShow.episode_run_time?.[0],
    rating: tmdbShow.vote_average,
  };
}

// Transform TMDB season to our Season type
function transformSeason(tmdbSeason: TMDBSeason): Season {
  return {
    id: tmdbSeason.id,
    season_number: tmdbSeason.season_number,
    name: tmdbSeason.name,
    overview: tmdbSeason.overview,
    poster_url: getImageUrl(tmdbSeason.poster_path, 'poster', 'medium'),
    air_date: tmdbSeason.air_date,
    episode_count: tmdbSeason.episode_count,
  };
}

// Transform TMDB episode to our Episode type
function transformEpisode(tmdbEpisode: TMDBEpisode): Episode {
  return {
    id: tmdbEpisode.id,
    episode_number: tmdbEpisode.episode_number,
    season_number: tmdbEpisode.season_number,
    name: tmdbEpisode.name,
    overview: tmdbEpisode.overview,
    still_url: tmdbEpisode.still_path ? getImageUrl(tmdbEpisode.still_path, 'backdrop', 'small') : '',
    air_date: tmdbEpisode.air_date,
    runtime: tmdbEpisode.runtime ?? undefined,
  };
}

// Search TV shows by query
export async function searchTVShows(query: string, page: number = 1): Promise<{
  shows: TVShow[];
  totalPages: number;
  totalResults: number;
}> {
  if (!query.trim()) {
    return { shows: [], totalPages: 0, totalResults: 0 };
  }

  const data = await tmdbFetch<TMDBTVSearchResponse>('/search/tv', {
    query: query.trim(),
    page: page.toString(),
    include_adult: 'false',
  });

  return {
    shows: data.results.map((s) => transformTVShow(s)),
    totalPages: data.total_pages,
    totalResults: data.total_results,
  };
}

// External IDs response type
interface TMDBExternalIds {
  imdb_id?: string;
  tvdb_id?: number;
}

// Get TV show details by ID (includes seasons)
export async function getTVShowDetails(showId: number): Promise<TVShowDetails> {
  // Fetch show details, credits, and external IDs in parallel
  const [showData, creditsData, externalIds] = await Promise.all([
    tmdbFetch<TMDBTVShow>(`/tv/${showId}`),
    tmdbFetch<TMDBCredits>(`/tv/${showId}/credits`),
    tmdbFetch<TMDBExternalIds>(`/tv/${showId}/external_ids`),
  ]);

  // Find creator from created_by field
  const creator = showData.created_by?.[0]?.name;

  // Extract top 10 cast members
  const cast: CastMember[] = creditsData.cast
    .sort((a, b) => a.order - b.order)
    .slice(0, 10)
    .map((c) => ({
      id: c.id,
      name: c.name,
      character: c.character,
      profile_url: getProfileImageUrl(c.profile_path),
    }));

  // Extract key crew members
  const seenCrewIds = new Set<number>();
  const crew: CrewMember[] = creditsData.crew
    .filter((c) => KEY_CREW_JOBS.includes(c.job) || c.job === 'Executive Producer')
    .filter((c) => {
      if (seenCrewIds.has(c.id)) return false;
      seenCrewIds.add(c.id);
      return true;
    })
    .slice(0, 10)
    .map((c) => ({
      id: c.id,
      name: c.name,
      job: c.job,
      department: c.department,
      profile_url: getProfileImageUrl(c.profile_path),
    }));

  // Transform seasons (filter out season 0 which is usually "Specials")
  const seasons: Season[] = (showData.seasons ?? [])
    .filter((s) => s.season_number > 0)
    .map((s) => transformSeason(s));

  return {
    ...transformTVShow(showData, creator),
    cast,
    crew,
    seasons,
    imdb_id: externalIds.imdb_id,
  };
}

// Get season details with episodes
export async function getSeasonDetails(showId: number, seasonNumber: number): Promise<{
  season: Season;
  episodes: Episode[];
}> {
  const data = await tmdbFetch<TMDBSeasonDetails>(`/tv/${showId}/season/${seasonNumber}`);

  return {
    season: {
      id: data.id,
      season_number: data.season_number,
      name: data.name,
      overview: data.overview,
      poster_url: getImageUrl(data.poster_path, 'poster', 'medium'),
      air_date: data.air_date,
      episode_count: data.episodes.length,
    },
    episodes: data.episodes.map((e) => transformEpisode(e)),
  };
}

// Get popular TV shows
export async function getPopularTVShows(page: number = 1): Promise<{
  shows: TVShow[];
  totalPages: number;
}> {
  const data = await tmdbFetch<TMDBTVSearchResponse>('/tv/popular', {
    page: page.toString(),
  });

  return {
    shows: data.results.map((s) => transformTVShow(s)),
    totalPages: data.total_pages,
  };
}

// Get trending TV shows (this week)
export async function getTrendingTVShows(): Promise<TVShow[]> {
  const data = await tmdbFetch<TMDBTVSearchResponse>('/trending/tv/week');
  return data.results.map((s) => transformTVShow(s));
}

// Multi-search (movies and TV shows combined)
export async function searchAll(query: string, page: number = 1): Promise<{
  results: (Movie | TVShow)[];
  totalPages: number;
  totalResults: number;
}> {
  if (!query.trim()) {
    return { results: [], totalPages: 0, totalResults: 0 };
  }

  interface TMDBMultiSearchResult {
    page: number;
    results: (TMDBMovie & TMDBTVShow & { media_type: 'movie' | 'tv' | 'person' })[];
    total_pages: number;
    total_results: number;
  }

  const data = await tmdbFetch<TMDBMultiSearchResult>('/search/multi', {
    query: query.trim(),
    page: page.toString(),
    include_adult: 'false',
  });

  const results = data.results
    .filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
    .map((r) => {
      if (r.media_type === 'movie') {
        return { ...transformMovie(r as TMDBMovie), content_type: 'movie' as const };
      } else {
        return { ...transformTVShow(r as TMDBTVShow), content_type: 'tv' as const };
      }
    });

  return {
    results,
    totalPages: data.total_pages,
    totalResults: data.total_results,
  };
}

// ============================================
// DISCOVER & PERSON SEARCH FUNCTIONS
// ============================================

// Discover movies by genre
export async function discoverMoviesByGenre(genreId: number, page: number = 1): Promise<Movie[]> {
  const data = await tmdbFetch<TMDBSearchResponse>('/discover/movie', {
    with_genres: genreId.toString(),
    sort_by: 'popularity.desc',
    page: page.toString(),
    include_adult: 'false',
  });

  return data.results.map((m) => transformMovie(m));
}

// Discover TV shows by genre
export async function discoverTVShowsByGenre(genreId: number, page: number = 1): Promise<TVShow[]> {
  const data = await tmdbFetch<TMDBTVSearchResponse>('/discover/tv', {
    with_genres: genreId.toString(),
    sort_by: 'popularity.desc',
    page: page.toString(),
    include_adult: 'false',
  });

  return data.results.map((s) => transformTVShow(s));
}

// Discover movies by multiple genre IDs
export async function discoverMoviesByGenres(genreIds: number[], page: number = 1): Promise<Movie[]> {
  const data = await tmdbFetch<TMDBSearchResponse>('/discover/movie', {
    with_genres: genreIds.join(','),
    sort_by: 'popularity.desc',
    page: page.toString(),
    include_adult: 'false',
  });

  return data.results.map((m) => transformMovie(m));
}

// TMDB Person types
interface TMDBPerson {
  id: number;
  name: string;
  profile_path: string | null;
  known_for_department: string;
  known_for?: (TMDBMovie | TMDBTVShow)[];
}

interface TMDBPersonSearchResponse {
  page: number;
  results: TMDBPerson[];
  total_pages: number;
  total_results: number;
}

interface TMDBPersonCredits {
  cast: (TMDBMovie & { character?: string })[];
  crew: (TMDBMovie & { job?: string })[];
}

// Transform TMDB person to our Person type
function transformPerson(tmdbPerson: TMDBPerson): Person {
  return {
    id: tmdbPerson.id,
    name: tmdbPerson.name,
    profile_url: getProfileImageUrl(tmdbPerson.profile_path),
    known_for_department: tmdbPerson.known_for_department,
  };
}

// Search for people (actors/directors)
export async function searchPeople(query: string, page: number = 1): Promise<{
  people: Person[];
  totalPages: number;
  totalResults: number;
}> {
  if (!query.trim()) {
    return { people: [], totalPages: 0, totalResults: 0 };
  }

  const data = await tmdbFetch<TMDBPersonSearchResponse>('/search/person', {
    query: query.trim(),
    page: page.toString(),
    include_adult: 'false',
  });

  return {
    people: data.results.map((p) => transformPerson(p)),
    totalPages: data.total_pages,
    totalResults: data.total_results,
  };
}

// ============================================
// VIDEO FUNCTIONS
// ============================================

interface TMDBVideo {
  id: string;
  key: string;
  name: string;
  site: string;
  type: string;
  official: boolean;
}

interface TMDBVideosResponse {
  id: number;
  results: TMDBVideo[];
}

// Get movie videos (trailers, teasers) - returns YouTube keys
export async function getMovieVideos(movieId: number): Promise<{
  trailerKey: string | null;
  teaserKey: string | null;
}> {
  try {
    const data = await tmdbFetch<TMDBVideosResponse>(`/movie/${movieId}/videos`);

    // Prioritize official trailers, then any trailer, then teasers
    const officialTrailer = data.results.find(
      (v) => v.site === 'YouTube' && v.type === 'Trailer' && v.official
    );
    const anyTrailer = data.results.find(
      (v) => v.site === 'YouTube' && v.type === 'Trailer'
    );
    const teaser = data.results.find(
      (v) => v.site === 'YouTube' && v.type === 'Teaser'
    );

    return {
      trailerKey: officialTrailer?.key || anyTrailer?.key || null,
      teaserKey: teaser?.key || null,
    };
  } catch (error) {
    console.error('Error fetching movie videos:', error);
    return { trailerKey: null, teaserKey: null };
  }
}

// Get person's movie credits (as actor or director)
export async function getPersonMovieCredits(personId: number): Promise<Movie[]> {
  const data = await tmdbFetch<TMDBPersonCredits>(`/person/${personId}/movie_credits`);

  // Combine cast and crew (directing), remove duplicates, sort by popularity
  const movieMap = new Map<number, TMDBMovie>();

  // Add movies from cast
  for (const movie of data.cast) {
    if (!movieMap.has(movie.id)) {
      movieMap.set(movie.id, movie);
    }
  }

  // Add movies from crew (directing jobs)
  for (const movie of data.crew) {
    if (movie.job === 'Director' && !movieMap.has(movie.id)) {
      movieMap.set(movie.id, movie);
    }
  }

  const movies = Array.from(movieMap.values())
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, 20);

  return movies.map((m) => transformMovie(m));
}
