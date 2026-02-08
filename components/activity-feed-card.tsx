import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { StarDisplay } from '@/components/ui/star-display';
import { HeartAnimation } from '@/components/ui/heart-animation';
import { ProfileAvatar } from '@/components/profile-avatar';
import { FriendChipsDisplay } from '@/components/friend-chips';
import { formatProgress } from '@/lib/activity';
import { getActivityLikes, toggleActivityLike, getActivityCommentCount, createNotification } from '@/lib/social';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { Activity } from '@/types';

interface ActivityFeedCardProps {
  activity: Activity;
  onPress?: () => void;
  onLikeChange?: () => void;
  refreshKey?: number;
  hidePoster?: boolean;
}

export const ActivityFeedCard = React.memo(function ActivityFeedCard({
  activity,
  onPress,
  onLikeChange,
  refreshKey,
  hidePoster = false,
}: ActivityFeedCardProps) {
  const router = useRouter();
  const { user: currentUser } = useAuth();

  const content = activity.content;
  const activityUser = activity.user;

  const [likeCount, setLikeCount] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [isLikeLoading, setIsLikeLoading] = useState(false);
  const [commentCount, setCommentCount] = useState(0);
  const [showHeart, setShowHeart] = useState(false);
  const [isCritiqueExpanded, setIsCritiqueExpanded] = useState(false);
  const [rankingScore, setRankingScore] = useState<number | null>(null);

  useEffect(() => {
    loadInteractions();
  }, [activity.id, refreshKey]);

  // Fetch ranking score if activity is completed and has content
  useEffect(() => {
    const loadRanking = async () => {
      if (!content) return;
      const { data } = await supabase
        .from('rankings')
        .select('display_score')
        .eq('user_id', activity.user_id)
        .eq('movie_id', content.tmdb_id)
        .eq('content_type', content.content_type)
        .maybeSingle();
      if (data) setRankingScore(data.display_score);
    };
    if (activity.status === 'completed' && content) {
      loadRanking();
    }
  }, [content?.tmdb_id, activity.user_id, activity.status]);

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

  // Double-tap to like handler
  const handleDoubleTapLike = useCallback(() => {
    if (!currentUser || isLikeLoading) return;

    // Show heart animation
    setShowHeart(true);

    // Haptic feedback (skip on web)
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    // If already liked, just show animation (no toggle)
    if (isLiked) return;

    // Trigger like
    handleLikePress();
  }, [currentUser, isLikeLoading, isLiked, handleLikePress]);

  const handleHeartAnimationComplete = useCallback(() => {
    setShowHeart(false);
  }, []);

  const handleCommentPress = () => {
    router.push(`/activity-detail/${activity.id}`);
  };

  if (!content || !activityUser) {
    return null;
  }

  const isCompleted = activity.status === 'completed';
  const isInProgress = activity.status === 'in_progress';
  const isBookmarked = activity.status === 'bookmarked';

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

  const renderStars = (rating: number) => {
    return <StarDisplay rating={rating} size={12} />;
  };

  // Double-tap gesture for liking
  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(300)
    .onEnd(() => {
      runOnJS(handleDoubleTapLike)();
    });

  return (
    <GestureDetector gesture={doubleTapGesture}>
      <Animated.View>
        <Pressable
          style={({ pressed }) => [styles.container, pressed && styles.pressed]}
          onPress={handleCardPress}
        >
      {/* User Header - Action First */}
      <View style={styles.userHeader}>
        <Pressable style={styles.userInfo} onPress={handleUserPress}>
          <ProfileAvatar
            imageUrl={activityUser.profile_image_url}
            username={activityUser.username}
            size="small"
            variant="circle"
          />
          <View style={styles.userTextContainer}>
            <Text style={styles.actionHeadline} numberOfLines={1}>
              <Text style={styles.displayName}>
                {activityUser.display_name || activityUser.username}
              </Text>
              {' '}
              <Text style={styles.actionVerb}>
                {isCompleted
                  ? activity.rated_season
                    ? `rated Season ${activity.rated_season} of`
                    : 'ranked'
                  : isBookmarked
                  ? 'added to watchlist'
                  : 'is watching'}
              </Text>
            </Text>
            <Text style={styles.timestamp}>{formatDate(activity.created_at)}</Text>
          </View>
        </Pressable>
      </View>

      {/* Content Row */}
      <View style={styles.contentRow}>
        {!hidePoster && (
          content.poster_url ? (
            <Image
              source={{ uri: content.poster_url }}
              style={styles.poster}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.poster, styles.posterPlaceholder]}>
              <Text style={styles.posterPlaceholderText}>{content.title[0]}</Text>
            </View>
          )
        )}

        <View style={[styles.contentDetails, hidePoster && styles.contentDetailsNoPoster]}>
          <Text style={styles.contentTitle} numberOfLines={2}>
            {content.title}
          </Text>

          {/* Completed: Show stars and optional numeric score */}
          {isCompleted && activity.star_rating && (
            <View style={styles.ratingRow}>
              {activity.rated_season ? (
                <View style={styles.watchBadge}>
                  <Text style={styles.watchBadgeText}>Season {activity.rated_season}</Text>
                </View>
              ) : activity.watch ? (
                <View style={styles.watchBadge}>
                  <Text style={styles.watchBadgeText}>Watch #{activity.watch.watch_number}</Text>
                </View>
              ) : null}
              {renderStars(activity.star_rating)}
              {!activity.rated_season && rankingScore !== null && (
                <Text style={styles.numericScore}> · {rankingScore.toFixed(1)}</Text>
              )}
            </View>
          )}

          {/* In Progress: Show status indicator and progress */}
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
            <View>
              <Text
                style={styles.reviewText}
                numberOfLines={isCritiqueExpanded ? undefined : 8}
              >
                <Text style={styles.critiqueLabel}>Critique: </Text>
                {activity.review_text}
              </Text>
              {activity.review_text.length > 300 && (
                <Pressable onPress={() => setIsCritiqueExpanded(!isCritiqueExpanded)}>
                  <Text style={styles.readMoreText}>
                    {isCritiqueExpanded ? 'Show less' : 'Read more'}
                  </Text>
                </Pressable>
              )}
            </View>
          )}
          {isInProgress && activity.note && (
            <Text style={styles.noteText} numberOfLines={2}>
              &quot;{activity.note}&quot;
            </Text>
          )}
        </View>
      </View>

      {/* Watched With */}
      {activity.tagged_friends && activity.tagged_friends.length > 0 && (
        <FriendChipsDisplay userIds={activity.tagged_friends} />
      )}

      {/* Watch Date - not shown for bookmarks */}
      {activity.watch_date && !isBookmarked && (
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

      {/* Heart animation overlay for double-tap like */}
      <HeartAnimation
        visible={showHeart}
        onComplete={handleHeartAnimationComplete}
      />
    </Pressable>
      </Animated.View>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.cardBackground,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
  },
  pressed: {
    opacity: 0.95,
  },
  userHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
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
  actionHeadline: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.text,
  },
  displayName: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.md,
    color: Colors.text,
  },
  actionVerb: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.md,
    color: Colors.stamp,
  },
  timestamp: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
    marginTop: 2,
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
  contentDetailsNoPoster: {
    flex: 1,
  },
  contentTitle: {
    fontFamily: Fonts.serifExtraBold,
    fontSize: FontSizes.lg,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  numericScore: {
    fontFamily: Fonts.sansBold,
    fontSize: FontSizes.md,
    color: Colors.stamp,
    marginLeft: Spacing.xs,
  },
  starsContainer: {
    flexDirection: 'row',
    gap: 2,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  progressText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.md,
    color: Colors.textMuted,
  },
  critiqueLabel: {
    fontFamily: Fonts.sansBold,
    fontSize: FontSizes.md,
    color: Colors.text,
  },
  reviewText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
    lineHeight: FontSizes.md * 1.5,
  },
  readMoreText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.sm,
    color: Colors.stamp,
    marginTop: Spacing.xs,
  },
  noteText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
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
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
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
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    marginRight: Spacing.xs,
  },
  watchBadgeText: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.sm,
    color: Colors.text,
  },
});
