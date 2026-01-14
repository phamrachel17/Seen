import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { Movie, Ranking, Bookmark } from '@/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const RANK_CARD_WIDTH = (SCREEN_WIDTH - Spacing.xl * 2 - Spacing.md) / 2;

interface RankedMovie extends Movie {
  ranking: Ranking;
}

interface BookmarkedMovie extends Movie {
  bookmark: Bookmark;
}

export default function ListsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const [rankings, setRankings] = useState<RankedMovie[]>([]);
  const [watchlist, setWatchlist] = useState<BookmarkedMovie[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadRankings = useCallback(async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('rankings')
      .select(`
        *,
        movies (*)
      `)
      .eq('user_id', user.id)
      .order('rank_position', { ascending: true });

    if (error) {
      console.error('Error loading rankings:', error);
      return;
    }

    const rankedMovies: RankedMovie[] = (data || [])
      .filter((item: { movies: Movie | null }) => item.movies)
      .map((item: { movies: Movie } & Ranking) => ({
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
      }));

    setRankings(rankedMovies);
  }, [user]);

  const loadWatchlist = useCallback(async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('bookmarks')
      .select(`
        *,
        movies (*)
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading watchlist:', error);
      return;
    }

    const bookmarkedMovies: BookmarkedMovie[] = (data || [])
      .filter((item: { movies: Movie | null }) => item.movies)
      .map((item: { movies: Movie } & Bookmark) => ({
        ...item.movies,
        bookmark: {
          id: item.id,
          user_id: item.user_id,
          movie_id: item.movie_id,
          created_at: item.created_at,
        },
      }));

    setWatchlist(bookmarkedMovies);
  }, [user]);

  // Refresh data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (user) {
        loadRankings();
        loadWatchlist();
      }
    }, [user, loadRankings, loadWatchlist])
  );

  const onRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([loadRankings(), loadWatchlist()]);
    setIsRefreshing(false);
  };

  const navigateToMovie = (movieId: number) => {
    router.push(`/movie/${movieId}`);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <View>
          <Text style={styles.archiveLabel}>
            ARCHIVE NO. {String(rankings.length).padStart(3, '0')}
          </Text>
          <Text style={styles.title}>Personal Archive</Text>
        </View>
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
        {/* Top Rankings Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Top Rankings</Text>
          {rankings.length > 0 && (
            <Text style={styles.countBadge}>{rankings.length} films</Text>
          )}
        </View>

        {rankings.length > 0 ? (
          <View style={styles.rankingsGrid}>
            {rankings.slice(0, 10).map((movie) => (
              <Pressable
                key={movie.id}
                style={({ pressed }) => [
                  styles.rankCard,
                  pressed && styles.cardPressed,
                ]}
                onPress={() => navigateToMovie(movie.id)}
              >
                <View style={styles.rankBadge}>
                  <Text style={styles.rankNumber}>#{movie.ranking.rank_position}</Text>
                </View>
                {movie.poster_url ? (
                  <Image
                    source={{ uri: movie.poster_url }}
                    style={styles.rankPoster}
                    contentFit="cover"
                  />
                ) : (
                  <View style={styles.posterPlaceholder}>
                    <Text style={styles.placeholderLetter}>{movie.title[0]}</Text>
                  </View>
                )}
                <View style={styles.rankInfo}>
                  <Text style={styles.rankTitle} numberOfLines={1}>
                    {movie.title}
                  </Text>
                  <Text style={styles.rankYear}>{movie.release_year}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              Start ranking films to build your list
            </Text>
            <Pressable
              style={styles.discoverButton}
              onPress={() => router.push('/(tabs)/discover')}
            >
              <Text style={styles.discoverButtonText}>Discover Films</Text>
            </Pressable>
          </View>
        )}

        {/* Watchlist Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Watchlist</Text>
          {watchlist.length > 0 && (
            <Text style={styles.countBadge}>{watchlist.length} films</Text>
          )}
        </View>

        {watchlist.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.watchlistScroll}
          >
            {watchlist.map((movie) => (
              <Pressable
                key={movie.id}
                style={({ pressed }) => [
                  styles.watchlistCard,
                  pressed && styles.cardPressed,
                ]}
                onPress={() => navigateToMovie(movie.id)}
              >
                {movie.poster_url ? (
                  <Image
                    source={{ uri: movie.poster_url }}
                    style={styles.watchlistPoster}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[styles.watchlistPoster, styles.posterPlaceholder]}>
                    <Text style={styles.placeholderLetter}>{movie.title[0]}</Text>
                  </View>
                )}
                <Text style={styles.watchlistTitle} numberOfLines={2}>
                  {movie.title}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              Bookmark films to watch later
            </Text>
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
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  archiveLabel: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.stamp,
    letterSpacing: 1,
    marginBottom: Spacing.xs,
  },
  title: {
    fontFamily: Fonts.serifBold,
    fontSize: FontSizes['3xl'],
    color: Colors.text,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing['3xl'],
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: Spacing.lg,
    marginTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.lg,
  },
  sectionTitle: {
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.xl,
    color: Colors.text,
  },
  countBadge: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    letterSpacing: 1,
  },
  rankingsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  rankCard: {
    width: RANK_CARD_WIDTH,
    marginBottom: Spacing.sm,
  },
  cardPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  rankBadge: {
    position: 'absolute',
    top: Spacing.sm,
    left: Spacing.sm,
    zIndex: 10,
    backgroundColor: Colors.stamp,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  rankNumber: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.xs,
    color: Colors.white,
  },
  rankPoster: {
    width: '100%',
    aspectRatio: 2 / 3,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dust,
  },
  posterPlaceholder: {
    width: '100%',
    aspectRatio: 2 / 3,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dust,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderLetter: {
    fontFamily: Fonts.serifBold,
    fontSize: FontSizes['2xl'],
    color: Colors.textMuted,
  },
  rankInfo: {
    marginTop: Spacing.sm,
  },
  rankTitle: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.sm,
    color: Colors.text,
  },
  rankYear: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  watchlistScroll: {
    paddingRight: Spacing.xl,
    gap: Spacing.md,
  },
  watchlistCard: {
    width: 100,
  },
  watchlistPoster: {
    width: 100,
    height: 150,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dust,
  },
  watchlistTitle: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.text,
    marginTop: Spacing.sm,
  },
  emptyState: {
    paddingVertical: Spacing['2xl'],
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
});
