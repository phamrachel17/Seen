import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { FriendChipsDisplay } from '@/components/friend-chips';
import { useAuth } from '@/lib/auth-context';
import { getContentById } from '@/lib/content';
import { getUserActivitiesForContent, formatProgress, deleteActivity } from '@/lib/activity';
import { Content, Activity } from '@/types';

export default function ActivityHistoryScreen() {
  const { contentId } = useLocalSearchParams<{ contentId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [content, setContent] = useState<Content | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (contentId && user) {
      loadData(parseInt(contentId, 10));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentId, user]);

  const loadData = async (id: number) => {
    try {
      setIsLoading(true);

      const [contentData, activitiesData] = await Promise.all([
        getContentById(id),
        user ? getUserActivitiesForContent(user.id, id) : [],
      ]);

      setContent(contentData);
      setActivities(activitiesData);
    } catch (error) {
      console.error('Error loading activity history:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteActivity = async (activityId: string) => {
    const success = await deleteActivity(activityId);
    if (success) {
      setActivities((prev) => prev.filter((a) => a.id !== activityId));
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

  const renderStars = (rating: number) => {
    return (
      <View style={styles.starsContainer}>
        {[1, 2, 3, 4, 5].map((star) => (
          <IconSymbol
            key={star}
            name={star <= rating ? 'star.fill' : 'star'}
            size={14}
            color={star <= rating ? Colors.starFilled : Colors.starEmpty}
          />
        ))}
      </View>
    );
  };

  const renderActivityCard = ({ item: activity }: { item: Activity }) => {
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
            <Text style={[styles.statusText, isCompleted && styles.statusTextCompleted]}>
              {isCompleted ? 'Completed' : 'In Progress'}
            </Text>
          </View>

          {/* Completed: Rating and review */}
          {isCompleted && activity.star_rating && (
            <View style={styles.ratingRow}>{renderStars(activity.star_rating)}</View>
          )}

          {isCompleted && activity.review_text && (
            <Text style={styles.reviewText}>{activity.review_text}</Text>
          )}

          {/* In Progress: Progress and note */}
          {!isCompleted && (
            <Text style={styles.progressText}>
              {formatProgress(activity) || 'Started watching'}
            </Text>
          )}

          {!isCompleted && activity.note && (
            <Text style={styles.noteText}>"{activity.note}"</Text>
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

        {/* Delete button */}
        <Pressable
          style={styles.deleteButton}
          onPress={() => handleDeleteActivity(activity.id)}
        >
          <IconSymbol name="trash" size={16} color={Colors.error} />
        </Pressable>
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.stamp} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol name="arrow.left" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Activity History</Text>
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
          </View>
        </View>
      )}

      {/* Activities List */}
      {activities.length > 0 ? (
        <FlatList
          data={activities}
          renderItem={renderActivityCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      ) : (
        <View style={styles.emptyState}>
          <IconSymbol name="clock" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyText}>No activity history yet</Text>
          <Pressable
            style={styles.logButton}
            onPress={() => router.push(`/log-activity/${contentId}`)}
          >
            <Text style={styles.logButtonText}>Log Activity</Text>
          </Pressable>
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
  listContent: {
    padding: Spacing.lg,
  },
  separator: {
    height: Spacing.lg,
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
});
