import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ProfileAvatar } from '@/components/profile-avatar';
import { FriendChipsDisplay } from '@/components/friend-chips';
import {
  getActivityLikes,
  toggleActivityLike,
  getActivityComments,
  addActivityComment,
  deleteComment,
  createNotification,
} from '@/lib/social';
import { getActivityById, formatProgress } from '@/lib/activity';
import { useAuth } from '@/lib/auth-context';
import { Activity, Comment } from '@/types';

export default function ActivityDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const scrollViewRef = useRef<ScrollView>(null);

  const [activity, setActivity] = useState<Activity | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [isLikeLoading, setIsLikeLoading] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isOwnActivity = user?.id === activity?.user_id;

  useEffect(() => {
    if (id) {
      loadActivity();
    }
  }, [id]);

  const loadActivity = async () => {
    try {
      setIsLoading(true);
      const data = await getActivityById(id!);

      if (!data) {
        console.error('Activity not found');
        return;
      }

      setActivity(data);
      await loadInteractions();
    } catch (error) {
      console.error('Error loading activity:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadInteractions = useCallback(async () => {
    if (!id) return;

    const [likes, activityComments] = await Promise.all([
      getActivityLikes(id, user?.id),
      getActivityComments(id),
    ]);

    setLikeCount(likes.count);
    setIsLiked(likes.likedByUser);
    setComments(activityComments);
  }, [id, user?.id]);

  const onRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([loadActivity(), loadInteractions()]);
    setIsRefreshing(false);
  };

  const handleLikePress = async () => {
    if (!user || isOwnActivity || isLikeLoading || !activity) return;

    setIsLikeLoading(true);
    const wasLiked = isLiked;
    setIsLiked(!wasLiked);
    setLikeCount((prev) => (wasLiked ? prev - 1 : prev + 1));

    const success = await toggleActivityLike(user.id, activity.id, wasLiked);

    if (!success) {
      setIsLiked(wasLiked);
      setLikeCount((prev) => (wasLiked ? prev + 1 : prev - 1));
    } else if (!wasLiked) {
      await createNotification({
        user_id: activity.user_id,
        actor_id: user.id,
        type: 'like',
        activity_id: activity.id,
      });
    }

    setIsLikeLoading(false);
  };

  const handleSubmitComment = async () => {
    if (!user || !activity || !commentText.trim() || isSubmitting) return;

    setIsSubmitting(true);

    const newComment = await addActivityComment(user.id, activity.id, commentText);

    if (newComment) {
      setComments((prev) => [...prev, newComment]);
      setCommentText('');

      // Send notification
      if (activity.user_id !== user.id) {
        await createNotification({
          user_id: activity.user_id,
          actor_id: user.id,
          type: 'comment',
          activity_id: activity.id,
          comment_id: newComment.id,
        });
      }

      // Scroll to bottom to show new comment
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }

    setIsSubmitting(false);
  };

  const handleDeleteComment = async (commentId: string) => {
    const success = await deleteComment(commentId);
    if (success) {
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    }
  };

  const handleUserPress = (userId: string) => {
    if (userId === user?.id) {
      router.push('/(tabs)/profile');
    } else {
      router.push(`/user/${userId}`);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatCommentTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const renderStars = (rating: number) => {
    return (
      <View style={styles.starsContainer}>
        {[1, 2, 3, 4, 5].map((star) => (
          <IconSymbol
            key={star}
            name={star <= rating ? 'star.fill' : 'star'}
            size={18}
            color={star <= rating ? Colors.starFilled : Colors.starEmpty}
          />
        ))}
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

  if (!activity || !activity.content || !activity.user) {
    return (
      <View style={[styles.errorContainer, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Activity not found</Text>
        <Pressable style={styles.backLink} onPress={() => router.back()}>
          <Text style={styles.backLinkText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const content = activity.content;
  const activityUser = activity.user;
  const isCompleted = activity.status === 'completed';

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol name="chevron.left" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>
          {isCompleted ? 'Review' : 'Activity'}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={Colors.stamp}
            colors={[Colors.stamp]}
          />
        }
      >
        {/* Author Info */}
        <Pressable
          style={styles.authorRow}
          onPress={() => handleUserPress(activity.user_id)}
        >
          <ProfileAvatar
            imageUrl={activityUser.profile_image_url}
            username={activityUser.username}
            size="small"
            variant="circle"
          />
          <View style={styles.authorInfo}>
            <Text style={styles.authorName}>
              {activityUser.display_name || activityUser.username}
            </Text>
            <Text style={styles.reviewDate}>{formatDate(activity.created_at)}</Text>
          </View>
        </Pressable>

        {/* Content Info */}
        <Pressable
          style={styles.movieSection}
          onPress={() => router.push(`/title/${content.tmdb_id}?type=${content.content_type}` as any)}
        >
          {content.poster_url && (
            <Image
              source={{ uri: content.poster_url }}
              style={styles.poster}
              contentFit="cover"
            />
          )}
          <View style={styles.movieInfo}>
            <Text style={styles.movieTitle}>{content.title}</Text>
            <Text style={styles.movieMeta}>
              {content.release_year}
              {content.director && ` \u2022 ${content.director}`}
            </Text>
            {isCompleted && activity.star_rating ? (
              renderStars(activity.star_rating)
            ) : (
              <View style={styles.progressContainer}>
                <IconSymbol name="play.circle.fill" size={16} color={Colors.stamp} />
                <Text style={styles.progressText}>
                  {formatProgress(activity) || 'In Progress'}
                </Text>
              </View>
            )}
          </View>
        </Pressable>

        {/* Review Text or Note */}
        {(activity.review_text || activity.note) && (
          <View style={styles.reviewTextSection}>
            <Text style={styles.reviewText}>
              {activity.review_text || activity.note}
            </Text>
          </View>
        )}

        {/* Watched With */}
        {activity.tagged_friends && activity.tagged_friends.length > 0 && (
          <View style={styles.watchedWithSection}>
            <FriendChipsDisplay userIds={activity.tagged_friends} />
          </View>
        )}

        {/* Actions Row */}
        <View style={styles.actionsRow}>
          {!isOwnActivity ? (
            <Pressable
              style={styles.actionButton}
              onPress={handleLikePress}
              disabled={isLikeLoading}
            >
              <IconSymbol
                name={isLiked ? 'heart.fill' : 'heart'}
                size={22}
                color={isLiked ? Colors.stamp : Colors.textMuted}
              />
              {likeCount > 0 && (
                <Text style={[styles.actionCount, isLiked && styles.actionCountActive]}>
                  {likeCount}
                </Text>
              )}
            </Pressable>
          ) : (
            <View style={styles.actionButton}>
              <IconSymbol name="heart" size={22} color={Colors.textMuted} />
              {likeCount > 0 && <Text style={styles.actionCount}>{likeCount}</Text>}
            </View>
          )}

          <View style={styles.actionButton}>
            <IconSymbol name="bubble.left" size={22} color={Colors.textMuted} />
            {comments.length > 0 && (
              <Text style={styles.actionCount}>{comments.length}</Text>
            )}
          </View>
        </View>

        {/* Comments Section */}
        <View style={styles.commentsSection}>
          <Text style={styles.commentsTitle}>Comments</Text>

          {comments.length === 0 ? (
            <Text style={styles.noComments}>No comments yet. Be the first!</Text>
          ) : (
            <View style={styles.commentsList}>
              {comments.map((comment) => (
                <View key={comment.id} style={styles.commentItem}>
                  <Pressable onPress={() => handleUserPress(comment.user_id)}>
                    <ProfileAvatar
                      imageUrl={comment.user?.profile_image_url}
                      username={comment.user?.username || '?'}
                      size="tiny"
                      variant="circle"
                    />
                  </Pressable>
                  <View style={styles.commentContent}>
                    <View style={styles.commentHeader}>
                      <Pressable onPress={() => handleUserPress(comment.user_id)}>
                        <Text style={styles.commentAuthor}>
                          {comment.user?.display_name || comment.user?.username}
                        </Text>
                      </Pressable>
                      <Text style={styles.commentTime}>
                        {formatCommentTime(comment.created_at)}
                      </Text>
                    </View>
                    <Text style={styles.commentText}>{comment.content}</Text>
                  </View>
                  {comment.user_id === user?.id && (
                    <Pressable
                      style={styles.deleteButton}
                      onPress={() => handleDeleteComment(comment.id)}
                      hitSlop={8}
                    >
                      <IconSymbol name="trash" size={14} color={Colors.textMuted} />
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Comment Input */}
      <View style={[styles.commentInputContainer, { paddingBottom: insets.bottom + Spacing.sm }]}>
        <ProfileAvatar
          imageUrl={undefined}
          username={user?.user_metadata?.username || '?'}
          size="tiny"
          variant="circle"
        />
        <TextInput
          style={styles.commentInput}
          value={commentText}
          onChangeText={setCommentText}
          placeholder="Add a comment..."
          placeholderTextColor={Colors.textMuted}
          multiline
          maxLength={500}
        />
        <Pressable
          style={[
            styles.sendButton,
            (!commentText.trim() || isSubmitting) && styles.sendButtonDisabled,
          ]}
          onPress={handleSubmitComment}
          disabled={!commentText.trim() || isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color={Colors.stamp} />
          ) : (
            <IconSymbol
              name="arrow.up.circle.fill"
              size={28}
              color={commentText.trim() ? Colors.stamp : Colors.textMuted}
            />
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
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
  errorContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  errorText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.lg,
    color: Colors.textMuted,
    marginBottom: Spacing.md,
  },
  backLink: {
    padding: Spacing.md,
  },
  backLinkText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.md,
    color: Colors.stamp,
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
    padding: Spacing.xl,
    paddingBottom: Spacing.xl,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  authorInfo: {
    flex: 1,
  },
  authorName: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.md,
    color: Colors.text,
  },
  reviewDate: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
  },
  movieSection: {
    flexDirection: 'row',
    gap: Spacing.lg,
    marginBottom: Spacing.xl,
    padding: Spacing.md,
    backgroundColor: Colors.cardBackground,
    borderRadius: BorderRadius.md,
  },
  poster: {
    width: 80,
    height: 120,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dust,
  },
  movieInfo: {
    flex: 1,
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  movieTitle: {
    fontFamily: Fonts.serifSemiBold,
    fontSize: FontSizes.lg,
    color: Colors.text,
  },
  movieMeta: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
  },
  starsContainer: {
    flexDirection: 'row',
    gap: 2,
    marginTop: Spacing.xs,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  progressText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.sm,
    color: Colors.stamp,
  },
  reviewTextSection: {
    marginBottom: Spacing.xl,
  },
  reviewText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.text,
    lineHeight: FontSizes.md * 1.6,
  },
  watchedWithSection: {
    marginBottom: Spacing.xl,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xl,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.xl,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
  },
  actionCount: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.textMuted,
  },
  actionCountActive: {
    color: Colors.stamp,
  },
  commentsSection: {
    flex: 1,
  },
  commentsTitle: {
    fontFamily: Fonts.serifSemiBold,
    fontSize: FontSizes.lg,
    color: Colors.text,
    marginBottom: Spacing.lg,
  },
  noComments: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingVertical: Spacing.xl,
  },
  commentsList: {
    gap: Spacing.lg,
  },
  commentItem: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  commentContent: {
    flex: 1,
    backgroundColor: Colors.cardBackground,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  commentAuthor: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.sm,
    color: Colors.text,
  },
  commentTime: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
  },
  commentText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    lineHeight: FontSizes.sm * 1.5,
  },
  deleteButton: {
    padding: Spacing.xs,
    alignSelf: 'flex-start',
  },
  commentInputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
  commentInput: {
    flex: 1,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.text,
    backgroundColor: Colors.cardBackground,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sendButton: {
    padding: Spacing.xs,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
});
