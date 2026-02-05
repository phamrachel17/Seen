import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  Alert,
} from 'react-native';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useCache } from '@/lib/cache-context';
import { reorderRankings, deleteRankingWithActivity } from '@/lib/ranking';
import { DraggableRankList, RankedMovie } from '@/components/draggable-rank-list';
import { ContentType } from '@/types';

export default function RankingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { invalidate } = useCache();
  const { userId } = useLocalSearchParams<{ userId?: string }>();

  // Use provided userId or fall back to current user
  const targetUserId = userId || user?.id;
  const isOwnRankings = !userId || userId === user?.id;

  // Cache rankings per tab to avoid flicker when switching
  const [movieRankings, setMovieRankings] = useState<RankedMovie[]>([]);
  const [tvRankings, setTvRankings] = useState<RankedMovie[]>([]);
  const [loadedTabs, setLoadedTabs] = useState<Set<ContentType>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ContentType>('movie');
  const [isEditMode, setIsEditMode] = useState(false);

  // Derived state - get current tab's rankings
  const rankings = activeTab === 'movie' ? movieRankings : tvRankings;
  const hasLoadedCurrentTab = loadedTabs.has(activeTab);

  const loadRankings = useCallback(async () => {
    if (!targetUserId) return;

    // Only show loading spinner if we haven't loaded this tab before
    if (!loadedTabs.has(activeTab)) {
      setIsLoading(true);
    }

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

      let rankedMovies: RankedMovie[] = [];

      if (rankingsData && rankingsData.length > 0) {
        // Get TMDB IDs from rankings
        const tmdbIds = rankingsData.map((r: any) => r.movie_id);

        // Map TMDB IDs to internal content IDs
        const { data: contentMapping } = await supabase
          .from('content')
          .select('id, tmdb_id')
          .in('tmdb_id', tmdbIds);

        // Build TMDB ID → content ID map
        // Use Number() to ensure consistent types (Supabase may return strings)
        const tmdbToContentMap = new Map<number, number>();
        for (const content of contentMapping || []) {
          tmdbToContentMap.set(Number(content.tmdb_id), Number(content.id));
        }

        // Get internal content IDs for activity query
        const contentIds = rankingsData
          .map((r: any) => tmdbToContentMap.get(Number(r.movie_id)))
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
        // Use Number() to ensure consistent types (Supabase may return strings)
        const ratingsMap = new Map<number, number>();
        for (const activity of activitiesData || []) {
          ratingsMap.set(Number(activity.content_id), activity.star_rating);
        }

        // Combine data - sorted by rank_position (already from DB)
        rankedMovies = rankingsData
          .filter((item: any) => item.movies)
          .map((item: any) => ({
            ...item.movies,
            ranking: {
              id: item.id,
              user_id: item.user_id,
              movie_id: item.movie_id,
              content_type: item.content_type,
              rank_position: item.rank_position,
              display_score: item.display_score,
              created_at: item.created_at,
              updated_at: item.updated_at,
            },
            star_rating: ratingsMap.get(tmdbToContentMap.get(Number(item.movie_id)) ?? -1) ?? null,
          }));
      }

      // Set the correct state based on active tab
      if (activeTab === 'movie') {
        setMovieRankings(rankedMovies);
      } else {
        setTvRankings(rankedMovies);
      }

      // Mark this tab as loaded
      setLoadedTabs(prev => new Set(prev).add(activeTab));
    } finally {
      setIsLoading(false);
    }
  }, [targetUserId, activeTab, loadedTabs]);

  useFocusEffect(
    useCallback(() => {
      if (targetUserId) {
        loadRankings();
      }
    }, [targetUserId, loadRankings, activeTab])
  );

  const onRefresh = async () => {
    setIsEditMode(false);
    setIsRefreshing(true);
    await loadRankings();
    setIsRefreshing(false);
  };

  const navigateToContent = (tmdbId: number) => {
    router.push(`/title/${tmdbId}?type=${activeTab}` as any);
  };

  const handleTabChange = (tab: ContentType) => {
    setIsEditMode(false);
    setActiveTab(tab);
  };

  const handleReorder = useCallback(
    async (fromIndex: number, toIndex: number) => {
      if (!user?.id || fromIndex === toIndex) return;

      // Optimistic update - reorder with NEIGHBOR-AWARE scoring (not full renormalization)
      const newRankings = [...rankings];
      const [moved] = newRankings.splice(fromIndex, 1);
      newRankings.splice(toIndex, 0, moved);

      // Calculate neighbor-aware score for the moved item ONLY
      const aboveItem = toIndex > 0 ? newRankings[toIndex - 1] : null;
      const belowItem = toIndex < newRankings.length - 1 ? newRankings[toIndex + 1] : null;

      let newScore: number;
      if (aboveItem && belowItem) {
        // Between two items - use midpoint
        newScore = (aboveItem.ranking.display_score + belowItem.ranking.display_score) / 2;
      } else if (aboveItem) {
        // At bottom - slightly below item above
        newScore = Math.max(aboveItem.ranking.display_score - 0.2, 1.0);
      } else if (belowItem) {
        // At top - slightly above item below
        newScore = Math.min(belowItem.ranking.display_score + 0.2, 10.0);
      } else {
        // Only item - keep current score
        newScore = moved.ranking.display_score;
      }

      // Update positions and ONLY the moved item's score
      newRankings.forEach((movie, index) => {
        movie.ranking = {
          ...movie.ranking,
          rank_position: index + 1,
          display_score: movie === moved ? Number(newScore.toFixed(1)) : movie.ranking.display_score,
        };
      });

      // Update the correct tab's state
      if (activeTab === 'movie') {
        setMovieRankings(newRankings);
      } else {
        setTvRankings(newRankings);
      }

      try {
        await reorderRankings(user.id, activeTab, fromIndex, toIndex);
        // Invalidate caches on successful reorder
        invalidate('ranking_reorder', user.id);
        // Reload to get any auto star promotion/demotion changes
        await loadRankings();
      } catch (error) {
        console.error('Failed to save reorder:', error);
        Alert.alert('Error', 'Failed to save new order. Please try again.');
        await loadRankings();
      }
    },
    [user?.id, activeTab, rankings, loadRankings, invalidate]
  );

  const handleDelete = useCallback(
    (tmdbId: number) => {
      if (!user?.id) return;

      // Find the movie to get its title
      const movie = rankings.find((r) => r.id === tmdbId);
      const title = movie?.title || 'this title';

      Alert.alert(
        'Remove from Rankings',
        `Remove "${title}" from your rankings? This will also delete your review and rating.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: async () => {
              // Optimistic update - remove from list
              // PRESERVE existing scores - only update positions, not scores
              const newRankings = rankings.filter((r) => r.id !== tmdbId);

              // Update positions only - preserve existing scores (no renormalization)
              newRankings.forEach((m, index) => {
                m.ranking = {
                  ...m.ranking,
                  rank_position: index + 1,
                  // Keep existing display_score - no renormalization
                };
              });

              // Update the correct tab's state
              if (activeTab === 'movie') {
                setMovieRankings(newRankings);
              } else {
                setTvRankings(newRankings);
              }

              // Exit edit mode if no more items to manage
              if (newRankings.length === 0) {
                setIsEditMode(false);
              }

              try {
                const success = await deleteRankingWithActivity(user.id, tmdbId, activeTab);
                if (!success) {
                  throw new Error('Delete failed');
                }
                // Invalidate caches on successful delete
                invalidate('ranking_delete', user.id);
              } catch (error) {
                console.error('Failed to delete ranking:', error);
                Alert.alert('Error', 'Failed to remove from rankings. Please try again.');
                await loadRankings();
              }
            },
          },
        ]
      );
    },
    [user?.id, activeTab, rankings, loadRankings, invalidate]
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol name="arrow.left" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>{isOwnRankings ? 'My Rankings' : 'Their Rankings'}</Text>
        {isOwnRankings && rankings.length >= 1 ? (
          <Pressable
            onPress={() => setIsEditMode(!isEditMode)}
            style={styles.editButton}
          >
            <Text style={styles.editButtonText}>
              {isEditMode ? 'Done' : 'Edit'}
            </Text>
          </Pressable>
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>

      {/* Content Type Toggle */}
      <View style={styles.toggleContainer}>
        <Pressable
          style={[styles.toggleTab, activeTab === 'movie' && styles.toggleTabActive]}
          onPress={() => handleTabChange('movie')}
        >
          <Text style={[styles.toggleText, activeTab === 'movie' && styles.toggleTextActive]}>
            Movies
          </Text>
        </Pressable>
        <Pressable
          style={[styles.toggleTab, activeTab === 'tv' && styles.toggleTabActive]}
          onPress={() => handleTabChange('tv')}
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
        scrollEnabled={!isEditMode}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={Colors.stamp}
            colors={[Colors.stamp]}
            enabled={!isEditMode}
          />
        }
      >
        {!isLoading && hasLoadedCurrentTab && rankings.length === 0 ? (
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
            <DraggableRankList
              rankings={rankings}
              onReorder={handleReorder}
              isEditMode={isEditMode && isOwnRankings}
              onItemPress={navigateToContent}
              onDelete={handleDelete}
            />
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
  editButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editButtonText: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.md,
    color: Colors.stamp,
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
});
