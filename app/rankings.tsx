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
import { reorderRankings } from '@/lib/ranking';
import { DraggableRankList, RankedMovie } from '@/components/draggable-rank-list';
import { ContentType } from '@/types';

export default function RankingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
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
            star_rating: ratingsMap.get(tmdbToContentMap.get(item.movie_id) ?? -1) || 0,
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

      // Optimistic update - reorder and recalculate scores
      const newRankings = [...rankings];
      const [moved] = newRankings.splice(fromIndex, 1);
      newRankings.splice(toIndex, 0, moved);

      // Recalculate display scores based on new positions
      const total = newRankings.length;
      newRankings.forEach((movie, index) => {
        const score = total <= 1 ? 10.0 : 10.0 - (index / (total - 1)) * 9.0;
        movie.ranking = {
          ...movie.ranking,
          display_score: Number(score.toFixed(1)),
          rank_position: index + 1,
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
      } catch (error) {
        console.error('Failed to save reorder:', error);
        Alert.alert('Error', 'Failed to save new order. Please try again.');
        await loadRankings();
      }
    },
    [user?.id, activeTab, rankings, loadRankings]
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol name="arrow.left" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>{isOwnRankings ? 'My Rankings' : 'Their Rankings'}</Text>
        {isOwnRankings && rankings.length > 1 ? (
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
