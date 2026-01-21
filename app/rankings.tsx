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
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { Movie, Ranking, ContentType } from '@/types';

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
  const { userId } = useLocalSearchParams<{ userId?: string }>();

  // Use provided userId or fall back to current user
  const targetUserId = userId || user?.id;
  const isOwnRankings = !userId || userId === user?.id;

  const [rankings, setRankings] = useState<RankedMovie[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ContentType>('movie');

  const loadRankings = useCallback(async () => {
    if (!targetUserId) return;

    try {
      // Fetch rankings with movies, filtered by content_type
      const { data: rankingsData, error: rankingsError } = await supabase
        .from('rankings')
        .select(`
          *,
          movies (*)
        `)
        .eq('user_id', targetUserId)
        .eq('content_type', activeTab)
        .order('rank_position', { ascending: true });

      if (rankingsError) {
        console.error('Error loading rankings:', rankingsError);
        return;
      }

      if (!rankingsData || rankingsData.length === 0) {
        setRankings([]);
        return;
      }

      // Get TMDB IDs from rankings
      const tmdbIds = rankingsData.map((r: any) => r.movie_id);

      // Map TMDB IDs to internal content IDs
      const { data: contentMapping } = await supabase
        .from('content')
        .select('id, tmdb_id')
        .in('tmdb_id', tmdbIds);

      // Build TMDB ID → content ID map
      const tmdbToContentMap = new Map<number, number>();
      for (const content of contentMapping || []) {
        tmdbToContentMap.set(content.tmdb_id, content.id);
      }

      // Get internal content IDs for activity query
      const contentIds = rankingsData
        .map((r: any) => tmdbToContentMap.get(r.movie_id))
        .filter((id): id is number => id !== undefined);

      // Fetch completed activities with star ratings using content IDs
      const { data: activitiesData } = await supabase
        .from('activity_log')
        .select('content_id, star_rating')
        .eq('user_id', targetUserId)
        .eq('status', 'completed')
        .in('content_id', contentIds)
        .not('star_rating', 'is', null);

      // Create map of content_id -> star_rating
      const ratingsMap = new Map<number, number>();
      for (const activity of activitiesData || []) {
        ratingsMap.set(activity.content_id, activity.star_rating);
      }

      // Combine data - sorted by rank_position (already from DB)
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
          star_rating: ratingsMap.get(tmdbToContentMap.get(item.movie_id)) || 0,
        }));

      setRankings(rankedMovies);
    } finally {
      setIsLoading(false);
    }
  }, [targetUserId, activeTab]);

  useFocusEffect(
    useCallback(() => {
      if (targetUserId) {
        loadRankings();
      }
    }, [targetUserId, loadRankings, activeTab])
  );

  const onRefresh = async () => {
    setIsRefreshing(true);
    await loadRankings();
    setIsRefreshing(false);
  };

  const navigateToContent = (tmdbId: number) => {
    router.push(`/title/${tmdbId}?type=${activeTab}` as any);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol name="arrow.left" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>{isOwnRankings ? 'My Rankings' : 'Their Rankings'}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Content Type Toggle */}
      <View style={styles.toggleContainer}>
        <Pressable
          style={[styles.toggleTab, activeTab === 'movie' && styles.toggleTabActive]}
          onPress={() => setActiveTab('movie')}
        >
          <Text style={[styles.toggleText, activeTab === 'movie' && styles.toggleTextActive]}>
            Movies
          </Text>
        </Pressable>
        <Pressable
          style={[styles.toggleTab, activeTab === 'tv' && styles.toggleTabActive]}
          onPress={() => setActiveTab('tv')}
        >
          <Text style={[styles.toggleText, activeTab === 'tv' && styles.toggleTextActive]}>
            TV Shows
          </Text>
        </Pressable>
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
            colors={[Colors.stamp]}
          />
        }
      >
        {!isLoading && rankings.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              {isOwnRankings
                ? `No ranked ${activeTab === 'movie' ? 'movies' : 'TV shows'} yet. Start reviewing to build your list.`
                : `No ranked ${activeTab === 'movie' ? 'movies' : 'TV shows'} yet.`}
            </Text>
            {isOwnRankings && (
              <Pressable
                style={styles.discoverButton}
                onPress={() => router.push('/(tabs)/discover')}
              >
                <Text style={styles.discoverButtonText}>Discover {activeTab === 'movie' ? 'Movies' : 'TV Shows'}</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <View style={styles.rankingsList}>
            {rankings.map((movie, index) => (
              <Pressable
                key={movie.id}
                style={({ pressed }) => [
                  styles.rankItem,
                  pressed && styles.itemPressed,
                ]}
                onPress={() => navigateToContent(movie.id)}
              >
                {/* Rank Number */}
                <View style={styles.rankNumberContainer}>
                  <Text style={[
                    styles.rankNumber,
                    index < 3 && styles.topRankNumber,
                  ]}>
                    {index + 1}
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
  toggleContainer: {
    flexDirection: 'row',
    marginHorizontal: Spacing.lg,
    marginVertical: Spacing.md,
    backgroundColor: Colors.dust,
    borderRadius: BorderRadius.md,
    padding: 4,
  },
  toggleTab: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    borderRadius: BorderRadius.sm,
  },
  toggleTabActive: {
    backgroundColor: Colors.cardBackground,
  },
  toggleText: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
  },
  toggleTextActive: {
    color: Colors.text,
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
