import { useState, useEffect } from 'react';
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { StarRating } from '@/components/star-rating';
import { getMovieDetails } from '@/lib/tmdb';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { Movie, Review } from '@/types';

export default function ReviewModal() {
  const { movieId } = useLocalSearchParams<{ movieId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [movie, setMovie] = useState<Movie | null>(null);
  const [existingReview, setExistingReview] = useState<Review | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [starRating, setStarRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);

  useEffect(() => {
    if (movieId) {
      loadData(parseInt(movieId, 10));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movieId]);

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
          setReviewText(review.review_text || '');
          setIsPrivate(review.is_private);
        }
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
      // Cache the movie first
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
        tagged_friends: [],
      };

      if (existingReview) {
        // Update existing review
        const { error } = await supabase
          .from('reviews')
          .update({
            ...reviewData,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingReview.id);

        if (error) {
          console.error('Error updating review:', error);
          return;
        }
      } else {
        // Create new review
        const { error } = await supabase.from('reviews').insert(reviewData);

        if (error) {
          console.error('Error inserting review:', error);
          return;
        }
      }

      router.back();
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
});
