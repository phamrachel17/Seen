import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ProfileAvatar } from '@/components/profile-avatar';
import { FriendChipsDisplay } from '@/components/friend-chips';
import { getReviewLikes, toggleLike, getCommentCount, createNotification } from '@/lib/social';
import { getWatchDates } from '@/lib/watch-history';
import { useAuth } from '@/lib/auth-context';
import { Movie, Review, User } from '@/types';

interface FeedReview extends Review {
  movies: Movie;
  users: Pick<User, 'id' | 'username' | 'display_name' | 'profile_image_url'>;
}

interface FeedCardProps {
  review: FeedReview;
  onLikeChange?: () => void;
}

export function FeedCard({ review, onLikeChange }: FeedCardProps) {
  const router = useRouter();
  const { user } = useAuth();

  const [likeCount, setLikeCount] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [isLikeLoading, setIsLikeLoading] = useState(false);
  const [commentCount, setCommentCount] = useState(0);
  const [watchDates, setWatchDates] = useState<string[]>([]);

  const isOwnReview = user?.id === review.user_id;
  // Check if review was edited (updated_at is after created_at)
  const isEdited = new Date(review.updated_at).getTime() > new Date(review.created_at).getTime() + 1000;
  // Use updated_at if edited, otherwise created_at
  const displayDate = isEdited ? review.updated_at : review.created_at;

  useEffect(() => {
    loadInteractions();
    loadWatchDates();
  }, [review.id]);

  const loadInteractions = async () => {
    const [likes, comments] = await Promise.all([
      getReviewLikes(review.id, user?.id),
      getCommentCount(review.id),
    ]);
    setLikeCount(likes.count);
    setIsLiked(likes.likedByUser);
    setCommentCount(comments);
  };

  const loadWatchDates = async () => {
    const dates = await getWatchDates(review.user_id, review.movie_id);
    setWatchDates(dates.map(d => d.watched_at));
  };

  const formatWatchDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const handleLikePress = useCallback(async () => {
    if (!user || isLikeLoading) return;

    setIsLikeLoading(true);

    // Optimistic update
    const wasLiked = isLiked;
    setIsLiked(!wasLiked);
    setLikeCount((prev) => (wasLiked ? prev - 1 : prev + 1));

    const success = await toggleLike(user.id, review.id, wasLiked);

    if (!success) {
      // Revert on failure
      setIsLiked(wasLiked);
      setLikeCount((prev) => (wasLiked ? prev + 1 : prev - 1));
    } else if (!wasLiked) {
      // Send notification on new like
      await createNotification({
        user_id: review.user_id,
        actor_id: user.id,
        type: 'like',
        review_id: review.id,
      });
    }

    setIsLikeLoading(false);
    onLikeChange?.();
  }, [user, isLikeLoading, isLiked, review.id, review.user_id, onLikeChange]);

  const handleCardPress = () => {
    router.push(`/review-detail/${review.id}`);
  };

  const handleCommentPress = () => {
    router.push(`/review-detail/${review.id}`);
  };

  const handleUserPress = () => {
    if (isOwnReview) {
      router.push('/(tabs)/profile');
    } else {
      router.push(`/user/${review.user_id}`);
    }
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
            imageUrl={review.users.profile_image_url}
            username={review.users.username}
            size="small"
            variant="circle"
          />
          <View style={styles.userTextContainer}>
            <Text style={styles.displayName} numberOfLines={1}>
              {review.users.display_name || review.users.username}
            </Text>
            <View style={styles.timestampRow}>
              <Text style={styles.timestamp}>{formatDate(displayDate)}</Text>
              {isEdited && (
                <Text style={styles.updateTypeLabel}>
                  {review.last_update_type === 'rating_changed' && '· Updated rating'}
                  {review.last_update_type === 'review_added' && '· Added review'}
                  {review.last_update_type === 'review_updated' && '· Updated review'}
                  {review.last_update_type === 'watch_date_added' && '· Rewatched'}
                  {!review.last_update_type && '· Edited'}
                </Text>
              )}
            </View>
          </View>
        </Pressable>
      </View>

      {/* Movie Content */}
      <View style={styles.movieContent}>
        {review.movies.poster_url ? (
          <Image
            source={{ uri: review.movies.poster_url }}
            style={styles.poster}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.poster, styles.posterPlaceholder]}>
            <Text style={styles.posterPlaceholderText}>
              {review.movies.title[0]}
            </Text>
          </View>
        )}

        <View style={styles.movieDetails}>
          <Text style={styles.movieTitle} numberOfLines={2}>
            {review.movies.title}
          </Text>
          <View style={styles.ratingRow}>
            {renderStars(review.star_rating)}
          </View>
          {review.review_text && (
            <Text style={styles.reviewText} numberOfLines={3}>
              {review.review_text}
            </Text>
          )}
        </View>
      </View>

      {/* Watched With */}
      {review.tagged_friends && review.tagged_friends.length > 0 && (
        <FriendChipsDisplay userIds={review.tagged_friends} />
      )}

      {/* Watch Dates */}
      {watchDates.length > 0 && (
        <View style={styles.watchDatesRow}>
          <IconSymbol name="calendar" size={14} color={Colors.textMuted} />
          <Text style={styles.watchDatesText}>
            Watched {watchDates.map(d => formatWatchDate(d)).join(', ')}
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

        {/* Private indicator */}
        {review.is_private && (
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
  updateTypeLabel: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.stamp,
  },
  movieContent: {
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
  movieDetails: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  movieTitle: {
    fontFamily: Fonts.serifSemiBold,
    fontSize: FontSizes.lg,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  starsContainer: {
    flexDirection: 'row',
    gap: 2,
  },
  watchDatesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  watchDatesText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
  },
  reviewText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    lineHeight: FontSizes.sm * 1.5,
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
  privateIndicator: {
    padding: Spacing.xs,
  },
});
