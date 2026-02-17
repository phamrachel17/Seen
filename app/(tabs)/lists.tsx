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
import { getUserActivities, isActivityInProgress } from '@/lib/activity';
import { getUserLists } from '@/lib/user-lists';
import { Movie, Ranking, Activity, Content, UserList } from '@/types';

interface RankedMovie extends Movie {
  ranking: Ranking;
}

interface BookmarkedMovie extends Content {
  bookmarked_at: string;
}

export default function ListsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const [rankingsCount, setRankingsCount] = useState(0);
  const [watchlist, setWatchlist] = useState<BookmarkedMovie[]>([]);
  const [currentlyWatching, setCurrentlyWatching] = useState<Activity[]>([]);
  const [userLists, setUserLists] = useState<UserList[]>([]);
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
        created_at,
        content:content_id (*)
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading watchlist:', error);
      return;
    }

    const bookmarkedMovies: BookmarkedMovie[] = (data || [])
      .filter((item: any) => item.content)
      .map((item: any) => ({
        ...item.content,
        bookmarked_at: item.created_at,
      }));

    setWatchlist(bookmarkedMovies);
  }, [user]);

  const loadCurrentlyWatching = useCallback(async () => {
    if (!user) return;
    const activities = await getUserActivities(user.id, 'in_progress');

    // Deduplicate by content_id FIRST, keeping the most recent activity per content
    const latestByContent = new Map<number, Activity>();
    for (const activity of activities) {
      const contentId = activity.content_id;
      if (!latestByContent.has(contentId)) {
        latestByContent.set(contentId, activity);
      }
    }

    // Filter to only include activities that are truly in progress (< 100%)
    const activeInProgress = Array.from(latestByContent.values()).filter(isActivityInProgress);

    setCurrentlyWatching(activeInProgress);
  }, [user]);

  const loadUserLists = useCallback(async () => {
    if (!user) return;
    const lists = await getUserLists(user.id);
    setUserLists(lists);
  }, [user]);

  // Refresh data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (user) {
        loadRankingsCount();
        loadWatchlist();
        loadCurrentlyWatching();
        loadUserLists();
      }
    }, [user, loadRankingsCount, loadWatchlist, loadCurrentlyWatching, loadUserLists])
  );

  const onRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([loadRankingsCount(), loadWatchlist(), loadCurrentlyWatching(), loadUserLists()]);
    setIsRefreshing(false);
  };

  const navigateToMovie = (movieId: number) => {
    router.push(`/title/${movieId}?type=movie` as any);
  };

  const navigateToContent = (tmdbId: number, contentType: string) => {
    router.push(`/title/${tmdbId}?type=${contentType}` as any);
  };

  const navigateToRankings = () => {
    router.push('/rankings');
  };

  const navigateToList = (listId: string) => {
    router.push(`/list/${listId}` as any);
  };

  const navigateToCreateList = () => {
    router.push('/create-list' as any);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <View style={styles.headerTextContainer}>
          <Text style={styles.seenTitle}>Seen</Text>
          <Text style={styles.listsLabel}>YOUR LISTS</Text>
        </View>
        <Text style={styles.archiveLabel}>Personal Archive</Text>
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

        {/* Want to Watch Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Want to Watch</Text>
          {watchlist.length > 0 && (
            <View style={styles.sectionHeaderRight}>
              <Text style={styles.countBadge}>{watchlist.length} films</Text>
              <Pressable onPress={() => router.push('/watchlist' as any)}>
                <Text style={styles.viewAllText}>View All</Text>
              </Pressable>
            </View>
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
                onPress={() => navigateToContent(movie.tmdb_id, movie.content_type || 'movie')}
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

        {/* Currently Watching Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Currently Watching</Text>
          {currentlyWatching.length > 0 && (
            <View style={styles.sectionHeaderRight}>
              <Text style={styles.countBadge}>{currentlyWatching.length} titles</Text>
              <Pressable onPress={() => router.push('/currently-watching' as any)}>
                <Text style={styles.viewAllText}>View All</Text>
              </Pressable>
            </View>
          )}
        </View>

        {currentlyWatching.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.watchlistScroll}
          >
            {currentlyWatching.map((activity) => (
              <Pressable
                key={activity.id}
                style={({ pressed }) => [
                  styles.watchlistCard,
                  pressed && styles.cardPressed,
                ]}
                onPress={() => navigateToContent(activity.content?.tmdb_id || activity.content_id, activity.content?.content_type || 'movie')}
              >
                <View style={styles.posterContainer}>
                  {activity.content?.poster_url ? (
                    <Image
                      source={{ uri: activity.content.poster_url }}
                      style={styles.watchlistPoster}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={[styles.watchlistPoster, styles.posterPlaceholder]}>
                      <Text style={styles.placeholderLetter}>
                        {activity.content?.title?.[0] || '?'}
                      </Text>
                    </View>
                  )}
                  {/* Progress badge */}
                  {(activity.progress_season || activity.progress_minutes) && (
                    <View style={styles.progressBadge}>
                      <Text style={styles.progressBadgeText}>
                        {activity.content?.content_type === 'tv'
                          ? `S${activity.progress_season || 1}`
                          : `${activity.progress_minutes || 0}m`}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={styles.watchlistTitle} numberOfLines={2}>
                  {activity.content?.title || 'Unknown'}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              Start watching something to track progress
            </Text>
          </View>
        )}

        {/* My Lists Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>My Lists</Text>
          {userLists.length > 0 ? (
            <Text style={styles.countBadge}>{userLists.length} lists</Text>
          ) : null}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.watchlistScroll}
        >
          {/* Create List Card */}
          <Pressable
            style={({ pressed }) => [
              styles.createListCard,
              pressed && styles.cardPressed,
            ]}
            onPress={navigateToCreateList}
          >
            <View style={styles.createListIconContainer}>
              <IconSymbol name="plus" size={24} color={Colors.stamp} />
            </View>
            <Text style={styles.createListText}>Create List</Text>
          </Pressable>

          {/* User's Custom Lists */}
          {userLists.map((list) => (
            <Pressable
              key={list.id}
              style={({ pressed }) => [
                styles.userListCard,
                pressed && styles.cardPressed,
              ]}
              onPress={() => navigateToList(list.id)}
            >
              <View style={styles.userListIconContainer}>
                <IconSymbol
                  name={list.icon_name as any}
                  size={24}
                  color={Colors.text}
                />
              </View>
              <Text style={styles.userListName} numberOfLines={2}>
                {list.name}
              </Text>
              <Text style={styles.userListCount}>
                {list.item_count || 0} {list.item_count === 1 ? 'item' : 'items'}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
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
  headerTextContainer: {
    flex: 1,
  },
  listsLabel: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    letterSpacing: 1,
    marginTop: Spacing.xs,
  },
  archiveLabel: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.stamp,
    letterSpacing: 1,
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
  sectionHeaderRight: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.md,
  },
  viewAllText: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.sm,
    color: Colors.stamp,
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
  posterContainer: {
    position: 'relative',
  },
  progressBadge: {
    position: 'absolute',
    bottom: Spacing.xs,
    left: Spacing.xs,
    backgroundColor: Colors.stamp,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  progressBadgeText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.xs,
    color: Colors.white,
  },
  createListCard: {
    width: 100,
    height: 150,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.cardBackground,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createListIconContainer: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dust,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  createListText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.stamp,
  },
  userListCard: {
    width: 100,
    height: 150,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.cardBackground,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userListIconContainer: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dust,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  userListName: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.sm,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  userListCount: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
  },
});
