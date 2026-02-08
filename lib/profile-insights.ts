import { supabase } from './supabase';

export interface ProfileInsights {
  topGenres: { genre: string; count: number; percentage: number }[];
  topDirector: { name: string; avgRating: number; count: number } | null;
  topActor: { name: string; avgRating: number; count: number } | null;
  favoriteDecade: { decade: string; avgRating: number; count: number } | null;
  topGenre: string | null;
  totalTitles: number;
}

interface ContentData {
  genres: string[] | null;
  director: string | null;
  lead_actor: string | null;
  release_year: number | null;
  content_type: string;
}

interface ActivityData {
  star_rating: number | null;
  content: ContentData | null;
}

interface RatingAggregation {
  totalStars: number;
  count: number;
}

/**
 * Get personalized insights from user's viewing history
 * Analyzes completed activities to extract:
 * - Top 5 genres with percentages (by count)
 * - Highest-rated director (movies only, by avg star rating, min 2 titles)
 * - Favorite decade (by avg star rating, min 2 titles)
 */
export async function getProfileInsights(userId: string): Promise<ProfileInsights> {
  const emptyResult: ProfileInsights = {
    topGenres: [],
    topDirector: null,
    topActor: null,
    favoriteDecade: null,
    topGenre: null,
    totalTitles: 0,
  };

  // Query completed activities with content data and star ratings
  const { data: activities, error } = await supabase
    .from('activity_log')
    .select(`
      star_rating,
      content:content_id (
        genres,
        director,
        lead_actor,
        release_year,
        content_type
      )
    `)
    .eq('user_id', userId)
    .eq('status', 'completed');

  if (error || !activities || activities.length === 0) {
    return emptyResult;
  }

  // Aggregate data
  const genreCount = new Map<string, number>();
  const directorRatings = new Map<string, RatingAggregation>();
  const actorRatings = new Map<string, RatingAggregation>();
  const decadeRatings = new Map<string, RatingAggregation>();
  let totalTitles = 0;

  for (const activity of activities) {
    const activityData = activity as ActivityData;
    const content = activityData.content;
    const starRating = activityData.star_rating;
    if (!content) continue;

    totalTitles++;

    // Count genres (still by count, not rating)
    if (content.genres && Array.isArray(content.genres)) {
      for (const genre of content.genres) {
        if (genre) {
          genreCount.set(genre, (genreCount.get(genre) || 0) + 1);
        }
      }
    }

    // Aggregate director ratings (movies only, only if rated)
    if (content.director && content.content_type === 'movie' && starRating) {
      const existing = directorRatings.get(content.director) || { totalStars: 0, count: 0 };
      directorRatings.set(content.director, {
        totalStars: existing.totalStars + starRating,
        count: existing.count + 1,
      });
    }

    // Aggregate actor ratings (all content types, only if rated)
    if (content.lead_actor && starRating) {
      const existing = actorRatings.get(content.lead_actor) || { totalStars: 0, count: 0 };
      actorRatings.set(content.lead_actor, {
        totalStars: existing.totalStars + starRating,
        count: existing.count + 1,
      });
    }

    // Aggregate decade ratings (only if rated)
    if (content.release_year && starRating) {
      const decade = `${Math.floor(content.release_year / 10) * 10}s`;
      const existing = decadeRatings.get(decade) || { totalStars: 0, count: 0 };
      decadeRatings.set(decade, {
        totalStars: existing.totalStars + starRating,
        count: existing.count + 1,
      });
    }
  }

  // Get top 5 genres with percentages
  const sortedGenres = Array.from(genreCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const maxGenreCount = sortedGenres.length > 0 ? sortedGenres[0][1] : 1;
  const topGenres = sortedGenres.map(([genre, count]) => ({
    genre,
    count,
    percentage: Math.round((count / maxGenreCount) * 100),
  }));

  // Get top director by weighted score (avgRating * log(count + 1), min 2 titles)
  const sortedDirectors = Array.from(directorRatings.entries())
    .filter(([, agg]) => agg.count >= 2)
    .map(([name, agg]) => ({
      name,
      avgRating: agg.totalStars / agg.count,
      count: agg.count,
    }))
    .sort((a, b) => {
      const scoreA = a.avgRating * Math.log(a.count + 1);
      const scoreB = b.avgRating * Math.log(b.count + 1);
      return scoreB - scoreA;
    });

  const topDirector = sortedDirectors.length > 0
    ? sortedDirectors[0]
    : null;

  // Get top actor by weighted score (avgRating * log(count + 1), min 2 titles)
  const sortedActors = Array.from(actorRatings.entries())
    .filter(([, agg]) => agg.count >= 2)
    .map(([name, agg]) => ({
      name,
      avgRating: agg.totalStars / agg.count,
      count: agg.count,
    }))
    .sort((a, b) => {
      const scoreA = a.avgRating * Math.log(a.count + 1);
      const scoreB = b.avgRating * Math.log(b.count + 1);
      return scoreB - scoreA;
    });

  const topActor = sortedActors.length > 0
    ? sortedActors[0]
    : null;

  // Get favorite decade by weighted score (avgRating * log(count + 1), min 2 titles)
  const sortedDecades = Array.from(decadeRatings.entries())
    .filter(([, agg]) => agg.count >= 2)
    .map(([decade, agg]) => ({
      decade,
      avgRating: agg.totalStars / agg.count,
      count: agg.count,
    }))
    .sort((a, b) => {
      const scoreA = a.avgRating * Math.log(a.count + 1);
      const scoreB = b.avgRating * Math.log(b.count + 1);
      return scoreB - scoreA;
    });

  const favoriteDecade = sortedDecades.length > 0
    ? sortedDecades[0]
    : null;

  return {
    topGenres,
    topDirector,
    topActor,
    favoriteDecade,
    topGenre: topGenres.length > 0 ? topGenres[0].genre : null,
    totalTitles,
  };
}
