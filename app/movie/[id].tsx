import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Dimensions,
  Animated,
  StatusBar,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { getMovieDetails } from '@/lib/tmdb';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { Movie, Review, Ranking } from '@/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const HEADER_MIN_HEIGHT = 220;
const HEADER_MAX_HEIGHT = 400;

export default function MovieDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const scrollY = useRef(new Animated.Value(0)).current;

  const [movie, setMovie] = useState<Movie | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [userReview, setUserReview] = useState<Review | null>(null);
  const [userRanking, setUserRanking] = useState<Ranking | null>(null);
  const [isTogglingBookmark, setIsTogglingBookmark] = useState(false);

  useEffect(() => {
    if (id) {
      loadMovie(parseInt(id, 10));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadMovie = async (movieId: number) => {
    try {
      setIsLoading(true);

      // Fetch movie details from TMDB
      const movieData = await getMovieDetails(movieId);
      setMovie(movieData);

      // Check user's bookmark, review, and ranking status
      if (user) {
        await Promise.all([
          checkBookmarkStatus(movieId),
          loadUserReview(movieId),
          loadUserRanking(movieId),
        ]);
      }
    } catch (error) {
      console.error('Error loading movie:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const checkBookmarkStatus = async (movieId: number) => {
    const { data } = await supabase
      .from('bookmarks')
      .select('id')
      .eq('user_id', user?.id)
      .eq('movie_id', movieId)
      .single();

    setIsBookmarked(!!data);
  };

  const loadUserReview = async (movieId: number) => {
    const { data } = await supabase
      .from('reviews')
      .select('*')
      .eq('user_id', user?.id)
      .eq('movie_id', movieId)
      .single();

    setUserReview(data);
  };

  const loadUserRanking = async (movieId: number) => {
    const { data } = await supabase
      .from('rankings')
      .select('*')
      .eq('user_id', user?.id)
      .eq('movie_id', movieId)
      .single();

    setUserRanking(data);
  };

  const toggleBookmark = async () => {
    if (!movie || !user || isTogglingBookmark) return;

    setIsTogglingBookmark(true);

    try {
      if (isBookmarked) {
        await supabase
          .from('bookmarks')
          .delete()
          .eq('user_id', user.id)
          .eq('movie_id', movie.id);
        setIsBookmarked(false);
      } else {
        await cacheMovie(movie);
        await supabase.from('bookmarks').insert({
          user_id: user.id,
          movie_id: movie.id,
        });
        setIsBookmarked(true);
      }
    } catch (error) {
      console.error('Error toggling bookmark:', error);
    } finally {
      setIsTogglingBookmark(false);
    }
  };

  const cacheMovie = async (movieData: Movie) => {
    await supabase.from('movies').upsert({
      id: movieData.id,
      title: movieData.title,
      poster_url: movieData.poster_url,
      backdrop_url: movieData.backdrop_url,
      release_year: movieData.release_year,
      genres: movieData.genres,
      director: movieData.director,
      synopsis: movieData.synopsis,
      popularity_score: movieData.popularity_score,
      runtime_minutes: movieData.runtime_minutes,
    });
  };

  const openReviewModal = () => {
    if (movie) {
      router.push(`/review/${movie.id}`);
    }
  };

  // Animated header height - expands when pulling down
  const headerHeight = scrollY.interpolate({
    inputRange: [-100, 0],
    outputRange: [HEADER_MAX_HEIGHT, HEADER_MIN_HEIGHT],
    extrapolate: 'clamp',
  });

  // Scale image when pulling down for stretch effect
  const imageScale = scrollY.interpolate({
    inputRange: [-100, 0],
    outputRange: [1.3, 1],
    extrapolate: 'clamp',
  });

  // Translate image to keep it centered when scaling
  const imageTranslateY = scrollY.interpolate({
    inputRange: [-100, 0],
    outputRange: [-50, 0],
    extrapolate: 'clamp',
  });

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
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backLink}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  // Use backdrop for widescreen header, fall back to poster
  const headerImageUrl = movie.backdrop_url || movie.poster_url;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Animated Header with Stretchable Image */}
      <Animated.View style={[styles.headerImageContainer, { height: headerHeight }]}>
        {headerImageUrl ? (
          <Animated.View
            style={[
              styles.imageWrapper,
              {
                transform: [{ scale: imageScale }, { translateY: imageTranslateY }],
              },
            ]}
          >
            <Image
              source={{ uri: headerImageUrl }}
              style={styles.headerImage}
              contentFit="cover"
              transition={200}
            />
          </Animated.View>
        ) : (
          <View style={styles.headerPlaceholder}>
            <Text style={styles.headerPlaceholderText}>{movie.title[0]}</Text>
          </View>
        )}
        {/* Gradient overlay */}
        <View style={styles.headerGradient} />
      </Animated.View>

      {/* Header Buttons */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol name="arrow.left" size={24} color={Colors.white} />
        </Pressable>
        <Pressable
          onPress={toggleBookmark}
          style={styles.bookmarkButton}
          disabled={isTogglingBookmark}
        >
          <IconSymbol
            name={isBookmarked ? 'bookmark.fill' : 'bookmark'}
            size={24}
            color={isBookmarked ? Colors.stamp : Colors.white}
          />
        </Pressable>
      </View>

      {/* Scrollable Content */}
      <Animated.ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingTop: HEADER_MIN_HEIGHT }]}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
      >
        {/* Movie Info */}
        <View style={styles.infoContainer}>
          <Text style={styles.title}>{movie.title}</Text>

          <View style={styles.metaRow}>
            {movie.release_year ? (
              <Text style={styles.year}>{movie.release_year}</Text>
            ) : null}
            {movie.director ? (
              <>
                <Text style={styles.metaDivider}>•</Text>
                <Text style={styles.director}>{movie.director}</Text>
              </>
            ) : null}
            {movie.runtime_minutes ? (
              <>
                <Text style={styles.metaDivider}>•</Text>
                <Text style={styles.runtime}>{movie.runtime_minutes} min</Text>
              </>
            ) : null}
          </View>

          {movie.genres && movie.genres.length > 0 ? (
            <View style={styles.genresRow}>
              {movie.genres.slice(0, 3).map((genre, index) => (
                <View key={index} style={styles.genreTag}>
                  <Text style={styles.genreText}>{genre}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {movie.synopsis ? (
            <Text style={styles.synopsis}>{movie.synopsis}</Text>
          ) : null}

          {/* User's Ranking */}
          {userRanking ? (
            <View style={styles.userRankingContainer}>
              <Text style={styles.userRankingLabel}>YOUR RANKING</Text>
              <Text style={styles.userRankingValue}>#{userRanking.rank_position}</Text>
            </View>
          ) : null}

          {/* Action Button */}
          <Pressable
            style={({ pressed }) => [
              styles.reviewButton,
              pressed && styles.buttonPressed,
            ]}
            onPress={openReviewModal}
          >
            <Text style={styles.reviewButtonText}>
              {userReview ? 'Edit Review' : 'Write a Review'}
            </Text>
          </Pressable>

          {/* User's Review */}
          {userReview ? (
            <View style={styles.userReviewContainer}>
              <View style={styles.reviewHeader}>
                <Text style={styles.reviewLabel}>YOUR REVIEW</Text>
                <View style={styles.starsRow}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <IconSymbol
                      key={star}
                      name={star <= userReview.star_rating ? 'star.fill' : 'star'}
                      size={16}
                      color={star <= userReview.star_rating ? Colors.starFilled : Colors.starEmpty}
                    />
                  ))}
                </View>
              </View>
              {userReview.review_text ? (
                <Text style={styles.reviewText}>{userReview.review_text}</Text>
              ) : null}
            </View>
          ) : null}
        </View>
      </Animated.ScrollView>
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
    marginBottom: Spacing.lg,
  },
  backLink: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.md,
    color: Colors.stamp,
  },
  headerImageContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
    backgroundColor: Colors.dust,
    zIndex: 1,
  },
  imageWrapper: {
    width: '100%',
    height: '100%',
  },
  headerImage: {
    width: '100%',
    height: '100%',
  },
  headerPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.dust,
  },
  headerPlaceholderText: {
    fontFamily: Fonts.serifBold,
    fontSize: FontSizes['5xl'],
    color: Colors.textMuted,
  },
  headerGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 80,
    backgroundColor: 'transparent',
    // Gradient effect using shadow
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookmarkButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
    zIndex: 2,
  },
  scrollContent: {
    paddingBottom: Spacing['3xl'],
  },
  infoContainer: {
    backgroundColor: Colors.background,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    marginTop: -Spacing.lg,
  },
  title: {
    fontFamily: Fonts.serifBold,
    fontSize: FontSizes['3xl'],
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: Spacing.md,
  },
  year: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
  },
  metaDivider: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.textMuted,
    marginHorizontal: Spacing.sm,
  },
  director: {
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.md,
    color: Colors.stamp,
  },
  runtime: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.textMuted,
  },
  genresRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  genreTag: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.dust,
    borderRadius: BorderRadius.full,
  },
  genreText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
  },
  synopsis: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.text,
    lineHeight: FontSizes.md * 1.6,
    marginBottom: Spacing.xl,
  },
  userRankingContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.cardBackground,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xl,
  },
  userRankingLabel: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    letterSpacing: 1,
  },
  userRankingValue: {
    fontFamily: Fonts.serifBold,
    fontSize: FontSizes['2xl'],
    color: Colors.stamp,
  },
  reviewButton: {
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    backgroundColor: Colors.stamp,
    marginBottom: Spacing.xl,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  reviewButtonText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.sm,
    color: Colors.white,
    letterSpacing: 1,
  },
  userReviewContainer: {
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.cardBackground,
    borderRadius: BorderRadius.md,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  reviewLabel: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    letterSpacing: 1,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 2,
  },
  reviewText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.text,
    lineHeight: FontSizes.md * 1.5,
  },
});
