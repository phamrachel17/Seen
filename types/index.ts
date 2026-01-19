export interface User {
  id: string;
  username: string;
  email: string;
  profile_image_url?: string;
  curation_identity?: string;
  display_name?: string;
  bio?: string;
  created_at: string;
}

export interface Movie {
  id: number; // TMDB ID
  title: string;
  poster_url: string;
  backdrop_url?: string;
  release_year: number;
  genres: string[];
  director?: string;
  synopsis?: string;
  popularity_score: number;
  runtime_minutes?: number;
  collection_id?: number;    // TMDB collection ID (franchise)
  collection_name?: string;  // e.g., "The Dark Knight Collection"
}

export interface CastMember {
  id: number;
  name: string;
  character: string;
  profile_url: string;
}

export interface CrewMember {
  id: number;
  name: string;
  job: string;
  department: string;
  profile_url: string;
}

// Extended movie details returned from getMovieDetails (includes cast/crew)
export interface MovieDetails extends Movie {
  cast: CastMember[];
  crew: CrewMember[];
}

// ============================================
// TV SHOW TYPES
// ============================================

export interface TVShow {
  id: number; // TMDB ID
  title: string;
  poster_url: string;
  backdrop_url?: string;
  release_year: number;
  genres: string[];
  creator?: string;
  synopsis?: string;
  popularity_score: number;
  total_seasons?: number;
  total_episodes?: number;
  episode_runtime?: number; // Average episode runtime in minutes
  content_type?: 'tv';
}

export interface Season {
  id: number;
  season_number: number;
  name: string;
  overview: string;
  poster_url: string;
  air_date: string;
  episode_count: number;
}

export interface Episode {
  id: number;
  episode_number: number;
  season_number: number;
  name: string;
  overview: string;
  still_url: string;
  air_date: string;
  runtime?: number;
}

// Extended TV show details (includes cast/crew and seasons)
export interface TVShowDetails extends TVShow {
  cast: CastMember[];
  crew: CrewMember[];
  seasons: Season[];
}

// ============================================
// UNIFIED CONTENT TYPES
// ============================================

export type ContentType = 'movie' | 'tv';

// Unified content record from database
export interface Content {
  id: number; // Database ID (SERIAL)
  tmdb_id: number;
  content_type: ContentType;
  title: string;
  poster_url?: string;
  backdrop_url?: string;
  release_year?: number;
  runtime_minutes?: number;
  director?: string;
  total_seasons?: number;
  total_episodes?: number;
  genres?: string[];
  synopsis?: string;
  popularity_score?: number;
  collection_id?: number;
  collection_name?: string;
  created_at: string;
}

// Activity status
export type ActivityStatus = 'completed' | 'in_progress';

// Activity log entry
export interface Activity {
  id: string;
  user_id: string;
  content_id: number;
  status: ActivityStatus;
  // Completed activity fields
  star_rating?: number; // 1-5, only for completed
  review_text?: string;
  // In Progress activity fields
  note?: string;
  progress_minutes?: number; // For movies
  progress_season?: number; // For TV
  progress_episode?: number; // For TV
  // Common fields
  watch_date?: string;
  tagged_friends?: string[];
  is_private: boolean;
  rated_season?: number; // For per-season TV ratings
  created_at: string;
  // Joined data
  content?: Content;
  user?: Pick<User, 'id' | 'username' | 'display_name' | 'profile_image_url'>;
}

export interface Review {
  id: string;
  user_id: string;
  movie_id: number;
  star_rating: number; // 1-5
  review_text?: string;
  is_private: boolean;
  tagged_friends: string[];
  cinema_location?: string;
  last_update_type?: 'rating_changed' | 'review_added' | 'review_updated' | 'watch_date_added';
  created_at: string;
  updated_at: string;
}

export interface Ranking {
  id: string;
  user_id: string;
  movie_id: number;
  rank_position: number;
  elo_score: number;
  created_at: string;
  updated_at: string;
}

export interface Bookmark {
  id: string;
  user_id: string;
  movie_id: number;
  created_at: string;
}

export interface Friendship {
  id: string;
  user_id: string;
  friend_id: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
}

export interface Follow {
  id: string;
  follower_id: string;
  following_id: string;
  created_at: string;
}

export interface UserSearchResult extends Pick<User, 'id' | 'username' | 'display_name' | 'profile_image_url'> {
  is_following?: boolean;
}

export interface FeedActivity {
  id: string;
  user_id: string;
  user: Pick<User, 'id' | 'username' | 'profile_image_url'>;
  activity_type: 'review' | 'bookmark' | 'ranking' | 'rewatch';
  movie: Pick<Movie, 'id' | 'title' | 'poster_url' | 'release_year' | 'director'>;
  review?: Pick<Review, 'star_rating' | 'review_text'>;
  list_name?: string;
  created_at: string;
}

export interface Like {
  id: string;
  user_id: string;
  review_id: string;
  created_at: string;
}

export interface Comment {
  id: string;
  user_id: string;
  review_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  // Joined data
  user?: Pick<User, 'id' | 'username' | 'display_name' | 'profile_image_url'>;
}

export interface Notification {
  id: string;
  user_id: string;
  actor_id: string;
  type: 'like' | 'comment' | 'tagged' | 'follow';
  review_id?: string;
  comment_id?: string;
  read: boolean;
  created_at: string;
  // Joined data
  actor?: Pick<User, 'id' | 'username' | 'display_name' | 'profile_image_url'>;
  review?: Pick<Review, 'id' | 'movie_id'> & { movies?: Pick<Movie, 'id' | 'title' | 'poster_url'> };
}

export interface WatchHistoryEntry {
  id: string;
  user_id: string;
  movie_id: number;
  watched_at: string; // ISO date string (YYYY-MM-DD)
  created_at: string;
}
