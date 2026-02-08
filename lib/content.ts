import { supabase } from './supabase';
import { Content, ContentType, Movie, TVShow } from '@/types';
import { getMovieDetails } from './tmdb';
import { getTVShowDetails } from './tmdb';

// Get content by ID
export async function getContentById(contentId: number): Promise<Content | null> {
  const { data, error } = await supabase
    .from('content')
    .select('*')
    .eq('id', contentId)
    .single();

  if (error) {
    console.error('Error fetching content:', error);
    return null;
  }

  return data;
}

// Get content by TMDB ID and type
export async function getContentByTmdbId(
  tmdbId: number,
  contentType: ContentType
): Promise<Content | null> {
  const { data, error } = await supabase
    .from('content')
    .select('*')
    .eq('tmdb_id', tmdbId)
    .eq('content_type', contentType)
    .single();

  if (error && error.code !== 'PGRST116') {
    // PGRST116 = no rows returned
    console.error('Error fetching content by TMDB ID:', error);
    return null;
  }

  return data;
}

// Ensure content exists in database, creating if needed
export async function ensureContentExists(
  tmdbId: number,
  contentType: ContentType
): Promise<Content | null> {
  // First check if it already exists
  const existing = await getContentByTmdbId(tmdbId, contentType);
  if (existing) {
    return existing;
  }

  // Fetch from TMDB and create
  if (contentType === 'movie') {
    return ensureMovieContent(tmdbId);
  } else {
    return ensureTVContent(tmdbId);
  }
}

// Create or get movie content
async function ensureMovieContent(tmdbId: number): Promise<Content | null> {
  try {
    const movieDetails = await getMovieDetails(tmdbId);

    // Get lead actor (first billed cast member)
    const leadActor = movieDetails.cast?.[0]?.name || null;

    const contentData = {
      tmdb_id: movieDetails.id,
      content_type: 'movie' as ContentType,
      title: movieDetails.title,
      poster_url: movieDetails.poster_url,
      backdrop_url: movieDetails.backdrop_url,
      release_year: movieDetails.release_year,
      runtime_minutes: movieDetails.runtime_minutes,
      director: movieDetails.director,
      lead_actor: leadActor,
      genres: movieDetails.genres,
      synopsis: movieDetails.synopsis,
      popularity_score: movieDetails.popularity_score,
      collection_id: movieDetails.collection_id,
      collection_name: movieDetails.collection_name,
    };

    const { data, error } = await supabase
      .from('content')
      .upsert(contentData, { onConflict: 'tmdb_id,content_type' })
      .select()
      .single();

    if (error) {
      console.error('Error creating movie content:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Error fetching movie from TMDB:', err);
    return null;
  }
}

// Create or get TV show content
async function ensureTVContent(tmdbId: number): Promise<Content | null> {
  try {
    const showDetails = await getTVShowDetails(tmdbId);

    // Get lead actor (first billed cast member)
    const leadActor = showDetails.cast?.[0]?.name || null;

    const contentData = {
      tmdb_id: showDetails.id,
      content_type: 'tv' as ContentType,
      title: showDetails.title,
      poster_url: showDetails.poster_url,
      backdrop_url: showDetails.backdrop_url,
      release_year: showDetails.release_year,
      total_seasons: showDetails.total_seasons,
      total_episodes: showDetails.total_episodes,
      episode_runtime: showDetails.episode_runtime,
      lead_actor: leadActor,
      genres: showDetails.genres,
      synopsis: showDetails.synopsis,
      popularity_score: showDetails.popularity_score,
    };

    const { data, error } = await supabase
      .from('content')
      .upsert(contentData, { onConflict: 'tmdb_id,content_type' })
      .select()
      .single();

    if (error) {
      console.error('Error creating TV content:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Error fetching TV show from TMDB:', err);
    return null;
  }
}

// Convert Movie type to Content for compatibility
export function movieToContent(movie: Movie): Partial<Content> {
  return {
    tmdb_id: movie.id,
    content_type: 'movie',
    title: movie.title,
    poster_url: movie.poster_url,
    backdrop_url: movie.backdrop_url,
    release_year: movie.release_year,
    runtime_minutes: movie.runtime_minutes,
    director: movie.director,
    genres: movie.genres,
    synopsis: movie.synopsis,
    popularity_score: movie.popularity_score,
    collection_id: movie.collection_id,
    collection_name: movie.collection_name,
  };
}

// Convert TVShow type to Content for compatibility
export function tvShowToContent(show: TVShow): Partial<Content> {
  return {
    tmdb_id: show.id,
    content_type: 'tv',
    title: show.title,
    poster_url: show.poster_url,
    backdrop_url: show.backdrop_url,
    release_year: show.release_year,
    total_seasons: show.total_seasons,
    total_episodes: show.total_episodes,
    genres: show.genres,
    synopsis: show.synopsis,
    popularity_score: show.popularity_score,
  };
}

// Get user's ranked content
export async function getUserRankedContent(userId: string): Promise<Content[]> {
  const { data, error } = await supabase
    .from('rankings')
    .select(`
      content_id,
      rank_position,
      content:content_id (*)
    `)
    .eq('user_id', userId)
    .not('content_id', 'is', null)
    .order('rank_position', { ascending: true });

  if (error) {
    console.error('Error fetching ranked content:', error);
    return [];
  }

  return data?.map((r: any) => r.content).filter(Boolean) || [];
}

// Get user's bookmarked content
export async function getUserBookmarkedContent(userId: string): Promise<Content[]> {
  const { data, error } = await supabase
    .from('bookmarks')
    .select(`
      content_id,
      content:content_id (*)
    `)
    .eq('user_id', userId)
    .not('content_id', 'is', null)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching bookmarked content:', error);
    return [];
  }

  return data?.map((r: any) => r.content).filter(Boolean) || [];
}
