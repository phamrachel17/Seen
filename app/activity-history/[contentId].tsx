import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  SectionList,
  RefreshControl,
} from 'react-native';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { FriendChipsDisplay } from '@/components/friend-chips';
import { useAuth } from '@/lib/auth-context';
import { getContentById } from '@/lib/content';
import { getWatchesForContent, formatProgress, deleteActivity } from '@/lib/activity';
import { Content, Activity, WatchWithActivities } from '@/types';
import { supabase } from '@/lib/supabase';

export default function ActivityHistoryScreen() {
  const { contentId, userId } = useLocalSearchParams<{ contentId: string; userId?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  // Determine if viewing own history or someone else's
  const targetUserId = userId || user?.id;
  const isOwnHistory = !userId || userId === user?.id;

  const [content, setContent] = useState<Content | null>(null);
  const [watches, setWatches] = useState<WatchWithActivities[]>([]);
  const [targetUser, setTargetUser] = useState<{ username: string; display_name?: string | null } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showAllWatches, setShowAllWatches] = useState(false);

  useEffect(() => {
    if (contentId && targetUserId) {
      loadData(parseInt(contentId, 10));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentId, targetUserId]);

  const loadData = async (id: number) => {
    try {
      setIsLoading(true);

      // If viewing another user's history, fetch their profile
      if (!isOwnHistory && userId) {
        const { data: userData } = await supabase
          .from('profiles')
          .select('username, display_name')
          .eq('id', userId)
          .single();
        setTargetUser(userData);
      }

      const [contentData, watchesData] = await Promise.all([
        getContentById(id),
        targetUserId ? getWatchesForContent(targetUserId, id) : [],
      ]);

      setContent(contentData);
      setWatches(watchesData);
    } catch (error) {
      console.error('Error loading activity history:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const onRefresh = async () => {
    if (!contentId) return;
    setIsRefreshing(true);
    await loadData(parseInt(contentId, 10));
    setIsRefreshing(false);
  };

  const handleDeleteActivity = async (activityId: string) => {
    const success = await deleteActivity(activityId);
    if (success) {
      // Update watches by removing the activity from its watch
      setWatches((prevWatches) =>
        prevWatches.map((watch) => ({
          ...watch,
          activities: watch.activities.filter((a) => a.id !== activityId),
        })).filter((watch) => watch.activities.length > 0) // Remove empty watches
      );
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatWatchDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getWatchStatusLabel = (status: string) => {
    switch (status) {
      case 'in_progress':
        return 'In Progress';
      case 'completed':
        return 'Completed';
      case 'abandoned':
        return 'Abandoned';
      default:
        return status;
    }
  };

  const getWatchStatusColor = (status: string) => {
    switch (status) {
      case 'in_progress':
        return Colors.textMuted;
      case 'completed':
        return Colors.stamp;
      case 'abandoned':
        return Colors.textMuted;
      default:
        return Colors.textMuted;
    }
  };

  const renderWatchHeader = (watch: WatchWithActivities) => {
    const isLegacy = watch.id === 'legacy';
    const statusColor = getWatchStatusColor(watch.status);

    return (
      <View style={styles.watchHeader}>
        <View style={styles.watchHeaderLeft}>
          <Text style={styles.watchNumber}>
            {isLegacy ? 'Previous Activity' : `Watch #${watch.watch_number}`}
          </Text>
          <View style={[styles.watchStatusBadge, { backgroundColor: statusColor + '20' }]}>
            <Text style={[styles.watchStatusText, { color: statusColor }]}>
              {getWatchStatusLabel(watch.status)}
            </Text>
          </View>
        </View>
        <View style={styles.watchHeaderRight}>
          {watch.latestProgress && (
            <Text style={styles.watchProgress}>{watch.latestProgress}</Text>
          )}
          {watch.progressPercent !== undefined && watch.progressPercent > 0 && (
            <Text style={styles.watchProgressPercent}>{watch.progressPercent}%</Text>
          )}
        </View>
      </View>
    );
  };

  const renderActivityCard = useCallback(
    ({ item: activity }: { item: Activity }) => {
      const isCompleted = activity.status === 'completed';

      return (
        <View style={styles.activityCard}>
          <Text style={styles.activityDate}>{formatDate(activity.created_at)}</Text>

          <View style={styles.activityContent}>
            {/* Status badge */}
            <View style={styles.statusRow}>
              <IconSymbol
                name={isCompleted ? 'checkmark.circle.fill' : 'play.circle.fill'}
                size={16}
                color={isCompleted ? Colors.stamp : Colors.textMuted}
              />
              {activity.watch && (
                <View style={styles.watchBadge}>
                  <Text style={styles.watchBadgeText}>Watch #{activity.watch.watch_number}</Text>
                </View>
              )}
              <Text style={[styles.statusText, isCompleted && styles.statusTextCompleted]}>
                {isCompleted ? 'Completed' : 'In Progress'}
              </Text>
            </View>

            {/* Rating details are now shown on the show page, not here */}

            {/* In Progress: Progress and note */}
            {!isCompleted && (
              <Text style={styles.progressText}>
                {formatProgress(activity) || 'Started watching'}
              </Text>
            )}

            {!isCompleted && activity.note && (
              <Text style={styles.noteText}>&quot;{activity.note}&quot;</Text>
            )}

            {/* Tagged friends */}
            {activity.tagged_friends && activity.tagged_friends.length > 0 && (
              <View style={styles.friendsRow}>
                <FriendChipsDisplay userIds={activity.tagged_friends} />
              </View>
            )}

            {/* Watch date */}
            {activity.watch_date && (
              <View style={styles.watchDateRow}>
                <IconSymbol name="calendar" size={14} color={Colors.textMuted} />
                <Text style={styles.watchDateText}>
                  {isCompleted ? 'Watched' : 'Started'} {formatWatchDate(activity.watch_date)}
                </Text>
              </View>
            )}

            {/* Private indicator */}
            {activity.is_private && (
              <View style={styles.privateRow}>
                <IconSymbol name="lock.fill" size={12} color={Colors.textMuted} />
                <Text style={styles.privateText}>Private</Text>
              </View>
            )}
          </View>

          {/* Delete button - only show for own history */}
          {isOwnHistory && (
            <Pressable
              style={styles.deleteButton}
              onPress={() => handleDeleteActivity(activity.id)}
            >
              <IconSymbol name="trash" size={16} color={Colors.error} />
            </Pressable>
          )}
        </View>
      );
    },
    [isOwnHistory]
  );

  // For other users, show only most recent watch unless expanded
  const displayWatches = !isOwnHistory && !showAllWatches && watches.length > 1
    ? [watches[0]]  // watches are already sorted by watch_number DESC
    : watches;

  const hasMoreWatches = !isOwnHistory && watches.length > 1;

  // Transform watches into SectionList data format
  // Show all watches - rating details are hidden in the card rendering
  const sections = displayWatches.map((watch) => ({
    watch,
    data: watch.activities,
  }));

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol name="arrow.left" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>
          {isOwnHistory ? 'Watch History' : `${targetUser?.display_name || targetUser?.username || 'Their'}'s Watches`}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Content Info */}
      {content && (
        <View style={styles.contentInfo}>
          {content.poster_url && (
            <Image
              source={{ uri: content.poster_url }}
              style={styles.poster}
              contentFit="cover"
            />
          )}
          <View style={styles.contentDetails}>
            <Text style={styles.contentTitle}>{content.title}</Text>
            <Text style={styles.contentMeta}>
              {content.release_year}
              {content.content_type === 'tv' && content.total_seasons && ` • ${content.total_seasons} Seasons`}
            </Text>
            {watches.length > 0 && (
              <Text style={styles.watchCount}>
                {watches.length} {watches.length === 1 ? 'watch' : 'watches'}
              </Text>
            )}
          </View>
        </View>
      )}

      {/* Watches List */}
      {sections.length > 0 ? (
        <>
          <SectionList
            sections={sections}
            renderItem={renderActivityCard}
            renderSectionHeader={({ section }) => renderWatchHeader(section.watch)}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={styles.activitySeparator} />}
            SectionSeparatorComponent={() => <View style={styles.sectionSeparator} />}
            stickySectionHeadersEnabled={false}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={onRefresh}
                tintColor={Colors.stamp}
                colors={[Colors.stamp]}
              />
            }
          />
          {hasMoreWatches && !showAllWatches && (
            <Pressable
              style={styles.viewAllButton}
              onPress={() => setShowAllWatches(true)}
            >
              <Text style={styles.viewAllButtonText}>
                View all {watches.length} watches
              </Text>
              <IconSymbol name="chevron.down" size={14} color={Colors.stamp} />
            </Pressable>
          )}
        </>
      ) : (
        <View style={styles.emptyState}>
          <IconSymbol name="clock" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyText}>
            {isOwnHistory ? 'No watch history yet' : 'No watches for this title'}
          </Text>
          {isOwnHistory && (
            <Pressable
              style={styles.logButton}
              onPress={() => router.push(`/log-activity/${contentId}`)}
            >
              <Text style={styles.logButtonText}>Log Activity</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
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
  contentInfo: {
    flexDirection: 'row',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  poster: {
    width: 60,
    height: 90,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dust,
  },
  contentDetails: {
    flex: 1,
    justifyContent: 'center',
  },
  contentTitle: {
    fontFamily: Fonts.serifSemiBold,
    fontSize: FontSizes.lg,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  contentMeta: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
  },
  watchCount: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.sm,
    color: Colors.stamp,
    marginTop: Spacing.xs,
  },
  listContent: {
    padding: Spacing.lg,
  },
  watchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    backgroundColor: Colors.background,
  },
  watchHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  watchNumber: {
    fontFamily: Fonts.serifSemiBold,
    fontSize: FontSizes.lg,
    color: Colors.text,
  },
  watchStatusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  watchStatusText: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.xs,
  },
  watchHeaderRight: {
    alignItems: 'flex-end',
  },
  watchProgress: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.sm,
    color: Colors.text,
  },
  watchProgressPercent: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
  },
  activitySeparator: {
    height: Spacing.md,
  },
  sectionSeparator: {
    height: Spacing.xl,
  },
  activityCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    position: 'relative',
  },
  activityDate: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    marginBottom: Spacing.md,
  },
  activityContent: {
    gap: Spacing.sm,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  statusText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.md,
    color: Colors.textMuted,
  },
  statusTextCompleted: {
    color: Colors.stamp,
  },
  ratingRow: {
    marginTop: Spacing.xs,
  },
  starsContainer: {
    flexDirection: 'row',
    gap: 2,
  },
  reviewText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.text,
    lineHeight: FontSizes.md * 1.5,
  },
  progressText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.lg,
    color: Colors.text,
  },
  noteText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
    fontStyle: 'italic',
  },
  friendsRow: {
    marginTop: Spacing.xs,
  },
  watchDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  watchDateText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
  },
  privateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  privateText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
  },
  deleteButton: {
    position: 'absolute',
    top: Spacing.md,
    right: Spacing.md,
    padding: Spacing.sm,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  emptyText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.textMuted,
  },
  logButton: {
    backgroundColor: Colors.stamp,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.sm,
    marginTop: Spacing.md,
  },
  logButtonText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.sm,
    color: Colors.white,
  },
  watchBadge: {
    backgroundColor: Colors.dust,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 1,
    borderRadius: BorderRadius.sm,
    marginHorizontal: Spacing.xs,
  },
  watchBadgeText: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.xs,
    color: Colors.text,
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.lg,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.stamp,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.cardBackground,
  },
  viewAllButtonText: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.sm,
    color: Colors.stamp,
  },
});
