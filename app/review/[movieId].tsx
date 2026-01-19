import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { StarRating } from '@/components/star-rating';
import { SuggestedFriendPills } from '@/components/suggested-friend-pills';
import { getMovieDetails } from '@/lib/tmdb';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { createNotification } from '@/lib/social';
import { getPendingFriendSelection } from '@/lib/friend-picker-state';
import { removeRanking } from '@/lib/ranking';
import { getWatchDates, addWatchDate, removeWatchDate } from '@/lib/watch-history';
import { Movie, Review, WatchHistoryEntry } from '@/types';

export default function ReviewModal() {
  const params = useLocalSearchParams<{
    movieId: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [movie, setMovie] = useState<Movie | null>(null);
  const [existingReview, setExistingReview] = useState<Review | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [starRating, setStarRating] = useState(0);
  const [originalStarRating, setOriginalStarRating] = useState<number | null>(null);
  const [reviewText, setReviewText] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [taggedFriends, setTaggedFriends] = useState<string[]>([]);

  // Watch date state
  const [watchDates, setWatchDates] = useState<WatchHistoryEntry[]>([]);
  const [pendingWatchDates, setPendingWatchDates] = useState<Date[]>([]);
  const [newWatchDate, setNewWatchDate] = useState<Date>(new Date());
  const [showAddDate, setShowAddDate] = useState(false);

  // Track original values for update type detection
  const [originalReviewText, setOriginalReviewText] = useState<string | null>(null);

  useEffect(() => {
    if (params.movieId) {
      loadData(parseInt(params.movieId, 10));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.movieId]);

  // Handle selected friends returning from friend picker
  useFocusEffect(
    useCallback(() => {
      const pending = getPendingFriendSelection();
      if (pending) {
        setTaggedFriends(pending);
      }
    }, [])
  );

  const loadData = async (id: number) => {
    try {
      setIsLoading(true);

      // Load movie details
      const movieData = await getMovieDetails(id);
      setMovie(movieData);

      // Check for existing review
      if (user) {
        const { data: review } = await supabase
          .from('reviews')
          .select('*')
          .eq('user_id', user.id)
          .eq('movie_id', id)
          .single();

        if (review) {
          setExistingReview(review);
          setStarRating(review.star_rating);
          setOriginalStarRating(review.star_rating);
          setReviewText(review.review_text || '');
          setOriginalReviewText(review.review_text || null);
          setIsPrivate(review.is_private);
          setTaggedFriends(review.tagged_friends || []);
        }

        // Load watch dates
        const dates = await getWatchDates(user.id, id);
        setWatchDates(dates);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!movie || !user || starRating === 0) return;

    setIsSaving(true);

    try {
      // Cache the movie first with all attributes
      const { error: movieError } = await supabase.from('movies').upsert({
        id: movie.id,
        title: movie.title,
        poster_url: movie.poster_url,
        backdrop_url: movie.backdrop_url,
        release_year: movie.release_year,
        genres: movie.genres,
        director: movie.director,
        synopsis: movie.synopsis,
        popularity_score: movie.popularity_score,
        runtime_minutes: movie.runtime_minutes,
        collection_id: movie.collection_id,
        collection_name: movie.collection_name,
      });

      if (movieError) {
        console.error('Error caching movie:', movieError);
      }

      const reviewData = {
        user_id: user.id,
        movie_id: movie.id,
        star_rating: starRating,
        review_text: reviewText.trim() || null,
        is_private: isPrivate,
        tagged_friends: taggedFriends,
      };

      if (existingReview) {
        // Determine what changed for update type
        let lastUpdateType: string | null = null;
        if (originalStarRating !== null && starRating !== originalStarRating) {
          lastUpdateType = 'rating_changed';
        } else if (reviewText.trim() && !originalReviewText) {
          lastUpdateType = 'review_added';
        } else if (reviewText.trim() !== (originalReviewText || '')) {
          lastUpdateType = 'review_updated';
        } else if (pendingWatchDates.length > 0) {
          lastUpdateType = 'watch_date_added';
        }

        // Update existing review
        const { error } = await supabase
          .from('reviews')
          .update({
            ...reviewData,
            last_update_type: lastUpdateType,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingReview.id);

        if (error) {
          console.error('Error updating review:', error);
          return;
        }

        // Save pending watch dates
        for (const date of pendingWatchDates) {
          await addWatchDate(user.id, movie.id, date);
        }

        // Check if star rating changed - need to re-rank
        if (originalStarRating !== null && starRating !== originalStarRating) {
          // Delete existing ranking first, then trigger ranking flow
          await removeRanking(user.id, movie.id);
          router.replace(`/rank/${movie.id}?starRating=${starRating}`);
        } else {
          // No rating change, just go back
          router.back();
        }
      } else {
        // Create new review
        const { data: newReview, error } = await supabase
          .from('reviews')
          .insert(reviewData)
          .select('id')
          .single();

        if (error || !newReview) {
          console.error('Error inserting review:', error);
          return;
        }

        // Send notifications to tagged friends
        for (const friendId of taggedFriends) {
          await createNotification({
            user_id: friendId,
            actor_id: user.id,
            type: 'tagged',
            review_id: newReview.id,
          });
        }

        // Auto-add today's date as watch date for new reviews
        await addWatchDate(user.id, movie.id, new Date());

        // Navigate to ranking flow with star rating for tier-based ranking
        router.replace(`/rank/${movie.id}?starRating=${starRating}`);
      }
    } catch (error) {
      console.error('Error saving review:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!existingReview || !user) return;

    setIsSaving(true);

    try {
      await supabase.from('reviews').delete().eq('id', existingReview.id);
      router.back();
    } catch (error) {
      console.error('Error deleting review:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddWatchDate = () => {
    // Add to local pending list (not database yet)
    setPendingWatchDates(prev => [...prev, newWatchDate]);
    setShowAddDate(false);
    setNewWatchDate(new Date());
  };

  const handleRemovePendingDate = (index: number) => {
    setPendingWatchDates(prev => prev.filter((_, i) => i !== index));
  };

  const handleRemoveWatchDate = async (watchHistoryId: string) => {
    const { error } = await removeWatchDate(watchHistoryId);

    if (!error) {
      setWatchDates(prev => prev.filter(d => d.id !== watchHistoryId));
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.stamp} />
      </View>
    );
  }

  if (!movie) {
    return (
      <View style={[styles.errorContainer, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Movie not found</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <Pressable onPress={() => router.back()} style={styles.closeButton}>
          <IconSymbol name="xmark" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>
          {existingReview ? 'Edit Review' : 'Write Review'}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Movie Info */}
        <View style={styles.movieInfo}>
          {movie.poster_url && (
            <Image
              source={{ uri: movie.poster_url }}
              style={styles.poster}
              contentFit="cover"
            />
          )}
          <View style={styles.movieDetails}>
            <Text style={styles.movieTitle}>{movie.title}</Text>
            <Text style={styles.movieMeta}>
              {movie.release_year}
              {movie.director && ` • ${movie.director}`}
            </Text>
          </View>
        </View>

        {/* Star Rating */}
        <View style={styles.ratingSection}>
          <Text style={styles.sectionLabel}>YOUR RATING</Text>
          <StarRating rating={starRating} onRatingChange={setStarRating} size={40} />
        </View>

        {/* Review Text */}
        <View style={styles.textSection}>
          <Text style={styles.sectionLabel}>YOUR THOUGHTS (OPTIONAL)</Text>
          <TextInput
            style={styles.textInput}
            value={reviewText}
            onChangeText={setReviewText}
            placeholder="What did you think about this film?"
            placeholderTextColor={Colors.textMuted}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
          />
        </View>

        {/* Privacy Toggle */}
        <View style={styles.privacySection}>
          <View style={styles.privacyInfo}>
            <Text style={styles.privacyLabel}>Private Review</Text>
            <Text style={styles.privacyDescription}>
              Only you can see this review
            </Text>
          </View>
          <Switch
            value={isPrivate}
            onValueChange={setIsPrivate}
            trackColor={{ false: Colors.dust, true: Colors.stamp }}
            thumbColor={Colors.white}
          />
        </View>

        {/* Watch Dates Section */}
        <View style={styles.watchDatesSection}>
          <Text style={styles.sectionLabel}>WATCH DATES</Text>

          {/* Existing and pending watch dates as pills */}
          {(watchDates.length > 0 || pendingWatchDates.length > 0) && (
            <View style={styles.watchDatePillsContainer}>
              {/* Existing dates from database */}
              {watchDates.map((entry) => (
                <View key={entry.id} style={styles.watchDatePill}>
                  <Text style={styles.watchDatePillText}>
                    {new Date(entry.watched_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </Text>
                  <Pressable
                    onPress={() => handleRemoveWatchDate(entry.id)}
                    hitSlop={8}
                  >
                    <IconSymbol name="xmark" size={12} color={Colors.textMuted} />
                  </Pressable>
                </View>
              ))}
              {/* Pending dates (not yet saved) */}
              {pendingWatchDates.map((date, index) => (
                <View key={`pending-${index}`} style={styles.pendingWatchDatePill}>
                  <Text style={styles.pendingWatchDatePillText}>
                    {date.toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </Text>
                  <Pressable
                    onPress={() => handleRemovePendingDate(index)}
                    hitSlop={8}
                  >
                    <IconSymbol name="xmark" size={12} color={Colors.stamp} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          {/* Pending date selection with compact picker */}
          {showAddDate && (
            <View style={styles.addDateRow}>
              <DateTimePicker
                value={newWatchDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'compact' : 'default'}
                maximumDate={new Date()}
                onChange={(event, date) => {
                  if (date) {
                    setNewWatchDate(date);
                  }
                }}
                themeVariant="light"
              />
              <Pressable
                style={styles.addDateButton}
                onPress={handleAddWatchDate}
              >
                <Text style={styles.addDateButtonText}>Add</Text>
              </Pressable>
            </View>
          )}

          {/* Add date button */}
          {!showAddDate && (
            <Pressable
              style={styles.addAnotherButton}
              onPress={() => {
                setNewWatchDate(new Date());
                setShowAddDate(true);
              }}
            >
              <IconSymbol name="plus" size={16} color={Colors.stamp} />
              <Text style={styles.addAnotherText}>
                {watchDates.length === 0 && pendingWatchDates.length === 0
                  ? 'Add watch date'
                  : 'Add another date'}
              </Text>
            </Pressable>
          )}
        </View>

        {/* Watched With - Section Header with Chevron */}
        <View style={styles.watchedWithSection}>
          <Pressable
            style={styles.sectionHeader}
            onPress={() =>
              router.push({
                pathname: '/friend-picker',
                params: {
                  movieId: params.movieId,
                  selectedIds: taggedFriends.join(','),
                },
              })
            }
          >
            <Text style={styles.sectionLabel}>WATCHED WITH</Text>
            <IconSymbol name="chevron.right" size={16} color={Colors.textMuted} />
          </Pressable>

          {/* Inline Suggestion Pills - Quick Toggle */}
          {user && (
            <SuggestedFriendPills
              userId={user.id}
              selectedIds={taggedFriends}
              onToggle={(id) => {
                setTaggedFriends((prev) =>
                  prev.includes(id)
                    ? prev.filter((f) => f !== id)
                    : [...prev, id]
                );
              }}
            />
          )}
        </View>

        {/* Action Buttons */}
        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [
              styles.saveButton,
              pressed && styles.buttonPressed,
              (isSaving || starRating === 0) && styles.buttonDisabled,
            ]}
            onPress={handleSave}
            disabled={isSaving || starRating === 0}
          >
            {isSaving ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.saveButtonText}>
                {existingReview ? 'Update Review' : 'Save Review'}
              </Text>
            )}
          </Pressable>

          {existingReview && (
            <Pressable
              style={({ pressed }) => [
                styles.deleteButton,
                pressed && styles.buttonPressed,
              ]}
              onPress={handleDelete}
              disabled={isSaving}
            >
              <Text style={styles.deleteButtonText}>Delete Review</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
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
  closeButton: {
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
    paddingBottom: Spacing['3xl'],
  },
  movieInfo: {
    flexDirection: 'row',
    gap: Spacing.lg,
    marginBottom: Spacing['2xl'],
  },
  poster: {
    width: 80,
    height: 120,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dust,
  },
  movieDetails: {
    flex: 1,
    justifyContent: 'center',
  },
  movieTitle: {
    fontFamily: Fonts.serifSemiBold,
    fontSize: FontSizes.xl,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  movieMeta: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.textMuted,
  },
  ratingSection: {
    marginBottom: Spacing['2xl'],
    alignItems: 'center',
  },
  sectionLabel: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    letterSpacing: 1.5,
    marginBottom: Spacing.md,
  },
  textSection: {
    marginBottom: Spacing['2xl'],
  },
  textInput: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.text,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    minHeight: 150,
  },
  privacySection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.cardBackground,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing['2xl'],
  },
  privacyInfo: {
    flex: 1,
  },
  privacyLabel: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.md,
    color: Colors.text,
    marginBottom: 2,
  },
  privacyDescription: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
  },
  watchedWithSection: {
    marginBottom: Spacing['2xl'],
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  addFriendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  addFriendText: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.md,
    color: Colors.stamp,
  },
  actions: {
    gap: Spacing.md,
  },
  saveButton: {
    backgroundColor: Colors.handwriting,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
  },
  saveButtonText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.sm,
    color: Colors.white,
    letterSpacing: 1.5,
  },
  deleteButton: {
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  deleteButtonText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.error,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  watchDatesSection: {
    marginBottom: Spacing['2xl'],
  },
  watchDatePillsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  watchDatePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.dust,
    paddingVertical: Spacing.sm,
    paddingLeft: Spacing.md,
    paddingRight: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  watchDatePillText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.text,
  },
  pendingWatchDatePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.background,
    paddingVertical: Spacing.sm,
    paddingLeft: Spacing.md,
    paddingRight: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.stamp,
    borderStyle: 'dashed',
  },
  pendingWatchDatePillText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.stamp,
  },
  addAnotherButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  addAnotherText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.stamp,
  },
  addDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  addDateButton: {
    backgroundColor: Colors.stamp,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.sm,
  },
  addDateButtonText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.sm,
    color: Colors.paper,
  },
});
