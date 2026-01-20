import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ProfileAvatar } from '@/components/profile-avatar';
import { FriendChipsDisplay } from '@/components/friend-chips';
import { formatProgress } from '@/lib/activity';
import { getActivityLikes, toggleActivityLike, getActivityCommentCount, createNotification } from '@/lib/social';
import { useAuth } from '@/lib/auth-context';
import { Activity } from '@/types';

interface ActivityFeedCardProps {
  activity: Activity;
  onPress?: () => void;
  onLikeChange?: () => void;
  refreshKey?: number;
}

export function ActivityFeedCard({ activity, onPress, onLikeChange, refreshKey }: ActivityFeedCardProps) {
  const router = useRouter();
  const { user: currentUser } = useAuth();

  const content = activity.content;
  const activityUser = activity.user;

  const [likeCount, setLikeCount] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [isLikeLoading, setIsLikeLoading] = useState(false);
  const [commentCount, setCommentCount] = useState(0);

  useEffect(() => {
    loadInteractions();
  }, [activity.id, refreshKey]);

  const loadInteractions = async () => {
    const [likes, comments] = await Promise.all([
      getActivityLikes(activity.id, currentUser?.id),
      getActivityCommentCount(activity.id),
    ]);
    setLikeCount(likes.count);
    setIsLiked(likes.likedByUser);
    setCommentCount(comments);
  };

  const handleLikePress = useCallback(async () => {
    if (!currentUser || isLikeLoading) return;

    setIsLikeLoading(true);

    // Optimistic update
    const wasLiked = isLiked;
    setIsLiked(!wasLiked);
    setLikeCount((prev) => (wasLiked ? prev - 1 : prev + 1));

    const success = await toggleActivityLike(currentUser.id, activity.id, wasLiked);

    if (!success) {
      // Revert on failure
      setIsLiked(wasLiked);
      setLikeCount((prev) => (wasLiked ? prev + 1 : prev - 1));
    } else if (!wasLiked && activity.user_id !== currentUser.id) {
      // Send notification on new like (not to self)
      await createNotification({
        user_id: activity.user_id,
        actor_id: currentUser.id,
        type: 'like',
        activity_id: activity.id,
      });
    }

    setIsLikeLoading(false);
    onLikeChange?.();
  }, [currentUser, isLikeLoading, isLiked, activity.id, activity.user_id, onLikeChange]);

  const handleCommentPress = () => {
    router.push(`/activity-detail/${activity.id}`);
  };

  if (!content || !activityUser) {
    return null;
  }

  const isCompleted = activity.status === 'completed';
  const isInProgress = activity.status === 'in_progress';

  const handleCardPress = () => {
    if (onPress) {
      onPress();
    } else if (content) {
      router.push(`/title/${content.tmdb_id}?type=${content.content_type}`);
    }
  };

  const handleUserPress = () => {
    router.push(`/user/${activity.user_id}`);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      if (diffHours === 0) {
        const diffMins = Math.floor(diffMs / (1000 * 60));
        return diffMins <= 1 ? 'Just now' : `${diffMins}m ago`;
      }
      return `${diffHours}h ago`;
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays}d ago`;
    }

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const formatWatchDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getActivityLabel = (): string => {
    if (isCompleted) {
      return 'Ranked';
    }
    if (isInProgress) {
      return 'Logged Progress';
    }
    return '';
  };

  const renderStars = (rating: number) => {
    return (
      <View style={styles.starsContainer}>
        {[1, 2, 3, 4, 5].map((star) => (
          <IconSymbol
            key={star}
            name={star <= rating ? 'star.fill' : 'star'}
            size={12}
            color={star <= rating ? Colors.starFilled : Colors.starEmpty}
          />
        ))}
      </View>
    );
  };

  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      onPress={handleCardPress}
    >
      {/* User Header */}
      <View style={styles.userHeader}>
        <Pressable style={styles.userInfo} onPress={handleUserPress}>
          <ProfileAvatar
            imageUrl={activityUser.profile_image_url}
            username={activityUser.username}
            size="small"
            variant="circle"
          />
          <View style={styles.userTextContainer}>
            <Text style={styles.displayName} numberOfLines={1}>
              {activityUser.display_name || activityUser.username}
            </Text>
            <View style={styles.timestampRow}>
              <Text style={styles.timestamp}>{formatDate(activity.created_at)}</Text>
              {getActivityLabel() && (
                <Text style={styles.activityLabel}>· {getActivityLabel()}</Text>
              )}
            </View>
          </View>
        </Pressable>
      </View>

      {/* Content Row */}
      <View style={styles.contentRow}>
        {content.poster_url ? (
          <Image
            source={{ uri: content.poster_url }}
            style={styles.poster}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.poster, styles.posterPlaceholder]}>
            <Text style={styles.posterPlaceholderText}>{content.title[0]}</Text>
          </View>
        )}

        <View style={styles.contentDetails}>
          <Text style={styles.contentTitle} numberOfLines={2}>
            {content.title}
          </Text>

          {/* Completed: Show stars */}
          {isCompleted && activity.star_rating && (
            <View style={styles.ratingRow}>
              {activity.watch && (
                <View style={styles.watchBadge}>
                  <Text style={styles.watchBadgeText}>Watch #{activity.watch.watch_number}</Text>
                </View>
              )}
              {renderStars(activity.star_rating)}
            </View>
          )}

          {/* In Progress: Show progress */}
          {isInProgress && (
            <View style={styles.progressRow}>
              <IconSymbol name="play.circle.fill" size={14} color={Colors.textMuted} />
              {activity.watch && (
                <View style={styles.watchBadge}>
                  <Text style={styles.watchBadgeText}>Watch #{activity.watch.watch_number}</Text>
                </View>
              )}
              <Text style={styles.progressText}>
                {formatProgress(activity) || 'In Progress'}
              </Text>
            </View>
          )}

          {/* Review text or note */}
          {isCompleted && activity.review_text && (
            <Text style={styles.reviewText} numberOfLines={3}>
              {activity.review_text}
            </Text>
          )}
          {isInProgress && activity.note && (
            <Text style={styles.noteText} numberOfLines={2}>
              "{activity.note}"
            </Text>
          )}
        </View>
      </View>

      {/* Watched With */}
      {activity.tagged_friends && activity.tagged_friends.length > 0 && (
        <FriendChipsDisplay userIds={activity.tagged_friends} />
      )}

      {/* Watch Date */}
      {activity.watch_date && (
        <View style={styles.watchDateRow}>
          <IconSymbol name="calendar" size={14} color={Colors.textMuted} />
          <Text style={styles.watchDateText}>
            {isCompleted ? 'Watched' : 'Started'} {formatWatchDate(activity.watch_date)}
          </Text>
        </View>
      )}

      {/* Actions Row */}
      <View style={styles.actionsRow}>
        {/* Like Button */}
        <Pressable
          style={styles.actionButton}
          onPress={handleLikePress}
          disabled={isLikeLoading}
        >
          <IconSymbol
            name={isLiked ? 'heart.fill' : 'heart'}
            size={24}
            color={isLiked ? Colors.stamp : Colors.textMuted}
          />
          {likeCount > 0 && (
            <Text style={[styles.actionCount, isLiked && styles.actionCountActive]}>
              {likeCount}
            </Text>
          )}
        </Pressable>

        {/* Comment Button */}
        <Pressable style={styles.actionButton} onPress={handleCommentPress}>
          <IconSymbol name="bubble.left" size={24} color={Colors.textMuted} />
          {commentCount > 0 && (
            <Text style={styles.actionCount}>{commentCount}</Text>
          )}
        </Pressable>

        {/* Spacer */}
        <View style={{ flex: 1 }} />

        {/* Content type indicator */}
        <View style={styles.typeIndicator}>
          <IconSymbol
            name={content.content_type === 'tv' ? 'tv' : 'film'}
            size={14}
            color={Colors.textMuted}
          />
        </View>

        {/* Private indicator */}
        {activity.is_private && (
          <View style={styles.privateIndicator}>
            <IconSymbol name="lock.fill" size={12} color={Colors.textMuted} />
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.cardBackground,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  pressed: {
    opacity: 0.95,
  },
  userHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  userTextContainer: {
    flex: 1,
  },
  displayName: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.md,
    color: Colors.text,
  },
  timestampRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  timestamp: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
  },
  activityLabel: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
  },
  contentRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  poster: {
    width: 70,
    height: 105,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dust,
  },
  posterPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  posterPlaceholderText: {
    fontFamily: Fonts.serifBold,
    fontSize: FontSizes.xl,
    color: Colors.textMuted,
  },
  contentDetails: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  contentTitle: {
    fontFamily: Fonts.serifSemiBold,
    fontSize: FontSizes.lg,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  starsContainer: {
    flexDirection: 'row',
    gap: 2,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  progressText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
  },
  reviewText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    lineHeight: FontSizes.sm * 1.5,
  },
  noteText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  watchDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  watchDateText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingRight: Spacing.md,
  },
  actionCount: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.textMuted,
  },
  actionCountActive: {
    color: Colors.stamp,
  },
  typeIndicator: {
    padding: Spacing.xs,
  },
  privateIndicator: {
    padding: Spacing.xs,
  },
  watchBadge: {
    backgroundColor: Colors.dust,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 1,
    borderRadius: BorderRadius.sm,
    marginRight: Spacing.xs,
  },
  watchBadgeText: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.xs,
    color: Colors.text,
  },
});
