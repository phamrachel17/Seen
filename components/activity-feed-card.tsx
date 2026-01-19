import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ProfileAvatar } from '@/components/profile-avatar';
import { FriendChipsDisplay } from '@/components/friend-chips';
import { formatProgress } from '@/lib/activity';
import { Activity } from '@/types';

interface ActivityFeedCardProps {
  activity: Activity;
  onPress?: () => void;
}

export function ActivityFeedCard({ activity, onPress }: ActivityFeedCardProps) {
  const router = useRouter();

  const content = activity.content;
  const user = activity.user;

  if (!content || !user) {
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
    if (isInProgress) {
      if (content.content_type === 'tv') {
        return 'Started watching';
      }
      return 'Started watching';
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
            imageUrl={user.profile_image_url}
            username={user.username}
            size="small"
            variant="circle"
          />
          <View style={styles.userTextContainer}>
            <Text style={styles.displayName} numberOfLines={1}>
              {user.display_name || user.username}
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
            <View style={styles.ratingRow}>{renderStars(activity.star_rating)}</View>
          )}

          {/* In Progress: Show progress */}
          {isInProgress && (
            <View style={styles.progressRow}>
              <IconSymbol name="play.circle.fill" size={14} color={Colors.textMuted} />
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
        {/* Like Button (placeholder for future) */}
        <View style={styles.actionButton}>
          <IconSymbol name="heart" size={24} color={Colors.textMuted} />
        </View>

        {/* Comment Button (placeholder for future) */}
        <View style={styles.actionButton}>
          <IconSymbol name="bubble.left" size={24} color={Colors.textMuted} />
        </View>

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
  typeIndicator: {
    padding: Spacing.xs,
  },
  privateIndicator: {
    padding: Spacing.xs,
  },
});
