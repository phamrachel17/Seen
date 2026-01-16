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

export interface Review {
  id: string;
  user_id: string;
  movie_id: number;
  star_rating: number; // 1-5
  review_text?: string;
  is_private: boolean;
  tagged_friends: string[];
  cinema_location?: string;
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
