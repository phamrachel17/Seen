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
import { Movie } from '@/types';

interface BookmarkedMovie extends Movie {
  bookmarked_at: string;
}

export default function WatchlistScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { userId } = useLocalSearchParams<{ userId?: string }>();

  // Use provided userId or fall back to current user
  const targetUserId = userId || user?.id;
  const isOwnWatchlist = !userId || userId === user?.id;

  const [movies, setMovies] = useState<BookmarkedMovie[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const loadWatchlist = useCallback(async () => {
    if (!targetUserId) return;

    try {
      const { data, error } = await supabase
        .from('bookmarks')
        .select(`
          created_at,
          movies (*)
        `)
        .eq('user_id', targetUserId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading watchlist:', error);
        return;
      }

      const bookmarkedMovies: BookmarkedMovie[] = (data || [])
        .filter((item: any) => item.movies)
        .map((item: any) => ({
          ...item.movies,
          bookmarked_at: item.created_at,
        }));

      setMovies(bookmarkedMovies);
    } finally {
      setIsLoading(false);
    }
  }, [targetUserId]);

  useFocusEffect(
    useCallback(() => {
      if (targetUserId) {
        loadWatchlist();
      }
    }, [targetUserId, loadWatchlist])
  );

  const onRefresh = async () => {
    setIsRefreshing(true);
    await loadWatchlist();
    setIsRefreshing(false);
  };

  const navigateToMovie = (movieId: number) => {
    router.push(`/title/${movieId}?type=movie` as any);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol name="arrow.left" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>{isOwnWatchlist ? 'Watchlist' : 'Their Watchlist'}</Text>
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
        {!isLoading && movies.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              {isOwnWatchlist
                ? 'Your watchlist is empty. Browse films and bookmark ones you want to watch.'
                : 'No films in watchlist yet.'}
            </Text>
            {isOwnWatchlist && (
              <Pressable
                style={styles.discoverButton}
                onPress={() => router.push('/(tabs)/discover')}
              >
                <Text style={styles.discoverButtonText}>Discover Films</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <View style={styles.movieList}>
            {movies.map((movie) => (
              <Pressable
                key={movie.id}
                style={({ pressed }) => [
                  styles.movieItem,
                  pressed && styles.itemPressed,
                ]}
                onPress={() => navigateToMovie(movie.id)}
              >
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
  movieList: {
    paddingTop: Spacing.sm,
  },
  movieItem: {
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
});
