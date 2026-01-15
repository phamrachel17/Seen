import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { Movie, Ranking } from '@/types';

interface RankedMovie extends Movie {
  ranking: Ranking;
  star_rating: number;
}

// Star display component
function StarDisplay({ rating, size = 12 }: { rating: number; size?: number }) {
  return (
    <View style={styles.starsContainer}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Text
          key={star}
          style={[
            styles.starIcon,
            { fontSize: size },
            star <= rating ? styles.starFilled : styles.starEmpty,
          ]}
        >
          ★
        </Text>
      ))}
    </View>
  );
}

export default function RankingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const [rankings, setRankings] = useState<RankedMovie[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const loadRankings = useCallback(async () => {
    if (!user) return;

    try {
      // Fetch rankings with movies
      const { data: rankingsData, error: rankingsError } = await supabase
        .from('rankings')
        .select(`
          *,
          movies (*)
        `)
        .eq('user_id', user.id)
        .order('rank_position', { ascending: true });

      if (rankingsError) {
        console.error('Error loading rankings:', rankingsError);
        return;
      }

      if (!rankingsData || rankingsData.length === 0) {
        setRankings([]);
        return;
      }

      // Get movie IDs to fetch reviews
      const movieIds = rankingsData.map((r: any) => r.movie_id);

      // Fetch reviews for star ratings
      const { data: reviewsData } = await supabase
        .from('reviews')
        .select('movie_id, star_rating')
        .eq('user_id', user.id)
        .in('movie_id', movieIds);

      // Create map of movie_id -> star_rating
      const reviewsMap = new Map<number, number>();
      for (const review of reviewsData || []) {
        reviewsMap.set(review.movie_id, review.star_rating);
      }

      // Combine and sort
      const rankedMovies: RankedMovie[] = rankingsData
        .filter((item: any) => item.movies)
        .map((item: any) => ({
          ...item.movies,
          ranking: {
            id: item.id,
            user_id: item.user_id,
            movie_id: item.movie_id,
            rank_position: item.rank_position,
            elo_score: item.elo_score,
            created_at: item.created_at,
            updated_at: item.updated_at,
          },
          star_rating: reviewsMap.get(item.movie_id) || 0,
        }));

      // Sort by star rating (desc) then by rank position (asc)
      rankedMovies.sort((a, b) => {
        if (b.star_rating !== a.star_rating) {
          return b.star_rating - a.star_rating;
        }
        return a.ranking.rank_position - b.ranking.rank_position;
      });

      setRankings(rankedMovies);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      if (user) {
        loadRankings();
      }
    }, [user, loadRankings])
  );

  const onRefresh = async () => {
    setIsRefreshing(true);
    await loadRankings();
    setIsRefreshing(false);
  };

  const navigateToMovie = (movieId: number) => {
    router.push(`/movie/${movieId}`);
  };

  // Group rankings by star rating for tier separators
  const groupedRankings: { rating: number; movies: RankedMovie[] }[] = [];
  let currentRating = -1;

  rankings.forEach((movie) => {
    if (movie.star_rating !== currentRating) {
      currentRating = movie.star_rating;
      groupedRankings.push({ rating: currentRating, movies: [] });
    }
    groupedRankings[groupedRankings.length - 1].movies.push(movie);
  });

  // Calculate position within tier
  const getTierPosition = (movie: RankedMovie, tierMovies: RankedMovie[]): number => {
    return tierMovies.findIndex((m) => m.id === movie.id) + 1;
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol name="arrow.left" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>My Rankings</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={Colors.stamp}
          />
        }
      >
        {!isLoading && rankings.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              No ranked films yet. Start reviewing movies to build your list.
            </Text>
            <Pressable
              style={styles.discoverButton}
              onPress={() => router.push('/(tabs)/discover')}
            >
              <Text style={styles.discoverButtonText}>Discover Films</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.rankingsList}>
            {groupedRankings.map((group) => (
              <View key={group.rating}>
                {/* Tier Header */}
                <View style={styles.tierHeader}>
                  <StarDisplay rating={group.rating} size={14} />
                  <Text style={styles.tierLabel}>
                    {group.movies.length} {group.movies.length === 1 ? 'film' : 'films'}
                  </Text>
                </View>

                {/* Movies in this tier */}
                {group.movies.map((movie) => (
                  <Pressable
                    key={movie.id}
                    style={({ pressed }) => [
                      styles.rankItem,
                      pressed && styles.itemPressed,
                    ]}
                    onPress={() => navigateToMovie(movie.id)}
                  >
                    {/* Tier Position */}
                    <View style={styles.rankNumberContainer}>
                      <Text style={[
                        styles.rankNumber,
                        getTierPosition(movie, group.movies) <= 3 && styles.topRankNumber,
                      ]}>
                        {getTierPosition(movie, group.movies)}
                      </Text>
                    </View>

                    {/* Poster */}
                    {movie.poster_url ? (
                      <Image
                        source={{ uri: movie.poster_url }}
                        style={styles.poster}
                        contentFit="cover"
                      />
                    ) : (
                      <View style={[styles.poster, styles.posterPlaceholder]}>
                        <Text style={styles.placeholderLetter}>{movie.title[0]}</Text>
                      </View>
                    )}

                    {/* Movie Info */}
                    <View style={styles.movieInfo}>
                      <Text style={styles.movieTitle} numberOfLines={2}>
                        {movie.title}
                      </Text>
                      <Text style={styles.movieMeta}>
                        {movie.release_year}
                        {movie.director ? ` • ${movie.director}` : ''}
                      </Text>
                    </View>

                    {/* Star Rating */}
                    <View style={styles.movieStars}>
                      <StarDisplay rating={movie.star_rating} size={10} />
                    </View>

                    {/* Chevron */}
                    <IconSymbol
                      name="chevron.right"
                      size={16}
                      color={Colors.textMuted}
                    />
                  </Pressable>
                ))}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: Fonts.serifSemiBold,
    fontSize: FontSizes.xl,
    color: Colors.text,
  },
  headerSpacer: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Spacing['3xl'],
  },
  emptyState: {
    paddingVertical: Spacing['4xl'],
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
  },
  emptyStateText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  discoverButton: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.stamp,
    borderRadius: BorderRadius.sm,
  },
  discoverButtonText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.sm,
    color: Colors.stamp,
    letterSpacing: 0.5,
  },
  rankingsList: {
    paddingTop: Spacing.sm,
  },
  tierHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.cardBackground,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    marginTop: Spacing.sm,
  },
  tierLabel: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    letterSpacing: 1,
  },
  rankItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  itemPressed: {
    backgroundColor: Colors.dust,
  },
  rankNumberContainer: {
    width: 32,
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  rankNumber: {
    fontFamily: Fonts.serifBold,
    fontSize: FontSizes.lg,
    color: Colors.textMuted,
  },
  topRankNumber: {
    color: Colors.stamp,
    fontSize: FontSizes.xl,
  },
  poster: {
    width: 50,
    height: 75,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dust,
  },
  posterPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderLetter: {
    fontFamily: Fonts.serifBold,
    fontSize: FontSizes.lg,
    color: Colors.textMuted,
  },
  movieInfo: {
    flex: 1,
    marginLeft: Spacing.md,
    marginRight: Spacing.sm,
  },
  movieTitle: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.md,
    color: Colors.text,
    marginBottom: 2,
  },
  movieMeta: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
  },
  movieStars: {
    marginRight: Spacing.sm,
  },
  starsContainer: {
    flexDirection: 'row',
    gap: 1,
  },
  starIcon: {
    fontFamily: Fonts.sans,
  },
  starFilled: {
    color: Colors.stamp,
  },
  starEmpty: {
    color: Colors.dust,
  },
});
