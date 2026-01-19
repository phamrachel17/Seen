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
import { Movie, Ranking, Bookmark } from '@/types';

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

  const [rankingsCount, setRankingsCount] = useState(0);
  const [watchlist, setWatchlist] = useState<BookmarkedMovie[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadRankingsCount = useCallback(async () => {
    if (!user) return;

    const { count, error } = await supabase
      .from('rankings')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    if (error) {
      console.error('Error loading rankings count:', error);
      return;
    }

    setRankingsCount(count || 0);
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
        loadRankingsCount();
        loadWatchlist();
      }
    }, [user, loadRankingsCount, loadWatchlist])
  );

  const onRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([loadRankingsCount(), loadWatchlist()]);
    setIsRefreshing(false);
  };

  const navigateToMovie = (movieId: number) => {
    router.push(`/title/${movieId}?type=movie` as any);
  };

  const navigateToRankings = () => {
    router.push('/rankings');
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Text style={styles.seenTitle}>Seen</Text>
        <View style={styles.archiveInfo}>
          <Text style={styles.archiveLabel}>
            ARCHIVE NO. {String(rankingsCount).padStart(3, '0')}
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
        {/* Rankings Button */}
        <Pressable
          style={({ pressed }) => [
            styles.rankingsButton,
            pressed && styles.buttonPressed,
          ]}
          onPress={navigateToRankings}
        >
          <View style={styles.rankingsButtonContent}>
            <View style={styles.rankingsIconContainer}>
              <IconSymbol name="list.number" size={24} color={Colors.stamp} />
            </View>
            <View style={styles.rankingsInfo}>
              <Text style={styles.rankingsButtonTitle}>My Rankings</Text>
              <Text style={styles.rankingsButtonSubtitle}>
                Your ranked films by star rating
              </Text>
            </View>
            <View style={styles.rankingsCount}>
              <Text style={styles.rankingsCountText}>{rankingsCount}</Text>
            </View>
            <IconSymbol name="chevron.right" size={20} color={Colors.textMuted} />
          </View>
        </Pressable>

        {/* Watchlist Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Watchlist</Text>
          {watchlist.length > 0 ? (
            <Text style={styles.countBadge}>{watchlist.length} films</Text>
          ) : null}
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
  seenTitle: {
    fontFamily: Fonts.serifBold,
    fontSize: FontSizes['3xl'],
    color: Colors.stamp,
  },
  archiveInfo: {
    alignItems: 'flex-end',
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
  rankingsButton: {
    backgroundColor: Colors.cardBackground,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginTop: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  buttonPressed: {
    opacity: 0.8,
    backgroundColor: Colors.dust,
  },
  rankingsButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rankingsIconContainer: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  rankingsInfo: {
    flex: 1,
  },
  rankingsButtonTitle: {
    fontFamily: Fonts.serifSemiBold,
    fontSize: FontSizes.lg,
    color: Colors.text,
    marginBottom: 2,
  },
  rankingsButtonSubtitle: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
  },
  rankingsCount: {
    backgroundColor: Colors.stamp,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    marginRight: Spacing.sm,
  },
  rankingsCountText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.md,
    color: Colors.white,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: Spacing.lg,
    marginTop: Spacing['2xl'],
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
  watchlistScroll: {
    paddingRight: Spacing.xl,
    gap: Spacing.md,
  },
  watchlistCard: {
    width: 100,
  },
  cardPressed: {
    opacity: 0.8,
  },
  watchlistPoster: {
    width: 100,
    height: 150,
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
});
