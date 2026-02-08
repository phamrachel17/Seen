import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  Animated,
  StatusBar,
} from 'react-native';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { StarDisplay } from '@/components/ui/star-display';
import { CastCrewSection } from '@/components/cast-crew-section';
import { FriendChipsDisplay } from '@/components/friend-chips';
import { ProfileAvatar } from '@/components/profile-avatar';
import { getMovieDetails } from '@/lib/tmdb';
import { getMovieAverageRating, getFriendsReviewsForMovie, FriendReview } from '@/lib/social';
import { getWatchDates } from '@/lib/watch-history';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { MovieDetails, Review, Ranking, WatchHistoryEntry } from '@/types';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const HEADER_MIN_HEIGHT = Math.round(SCREEN_HEIGHT * 0.35);
const HEADER_MAX_HEIGHT = Math.round(SCREEN_HEIGHT * 0.45);

export default function MovieDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const scrollY = useRef(new Animated.Value(0)).current;

  const [movie, setMovie] = useState<MovieDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [userReview, setUserReview] = useState<Review | null>(null);
  const [userRanking, setUserRanking] = useState<Ranking | null>(null);
  const [isTogglingBookmark, setIsTogglingBookmark] = useState(false);
  const [communityRating, setCommunityRating] = useState<{
    average: number;
    count: number;
  } | null>(null);
  const [friendsReviews, setFriendsReviews] = useState<FriendReview[]>([]);
  const [userWatchDates, setUserWatchDates] = useState<WatchHistoryEntry[]>([]);

  useEffect(() => {
    if (id) {
      loadMovie(parseInt(id, 10));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadMovie = async (movieId: number) => {
    try {
      setIsLoading(true);

      // Fetch movie details from TMDB and community rating in parallel
      const [movieData, ratingData] = await Promise.all([
        getMovieDetails(movieId),
        getMovieAverageRating(movieId),
      ]);
      setMovie(movieData);
      setCommunityRating(ratingData);

      // Check user's bookmark, review, ranking status, friends' reviews, and watch dates
      if (user) {
        const [, , , friendReviews, watchDates] = await Promise.all([
          checkBookmarkStatus(movieId),
          loadUserReview(movieId),
          loadUserRanking(movieId),
          getFriendsReviewsForMovie(user.id, movieId),
          getWatchDates(user.id, movieId),
        ]);
        setFriendsReviews(friendReviews);
        setUserWatchDates(watchDates);
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

  const cacheMovie = async (movieData: MovieDetails) => {
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
    return <LoadingScreen />;
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
        {/* Gradient overlay for smooth fade to background */}
        <LinearGradient
          colors={['transparent', 'transparent', Colors.background]}
          locations={[0, 0.5, 1]}
          style={styles.headerGradient}
        />
      </Animated.View>

      {/* Back Button Only */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol name="arrow.left" size={24} color={Colors.white} />
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

          {/* Rating Row: Stars + Numeric + Count ... Bookmark */}
          <View style={styles.ratingRow}>
            <View style={styles.ratingLeft}>
              {communityRating ? (
                <>
                  <View style={styles.starsRow}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <IconSymbol
                        key={star}
                        name={star <= Math.round(communityRating.average) ? 'star.fill' : 'star'}
                        size={14}
                        color={star <= Math.round(communityRating.average) ? Colors.starFilled : Colors.starEmpty}
                      />
                    ))}
                  </View>
                  <Text style={styles.ratingNumeric}>{communityRating.average.toFixed(1)}</Text>
                  <Text style={styles.ratingCount}>({communityRating.count})</Text>
                </>
              ) : (
                <Text style={styles.noRatings}>No ratings yet</Text>
              )}
            </View>
            <Pressable
              onPress={toggleBookmark}
              style={styles.bookmarkButtonInline}
              disabled={isTogglingBookmark}
            >
              <IconSymbol
                name={isBookmarked ? 'bookmark.fill' : 'bookmark'}
                size={22}
                color={Colors.stamp}
              />
            </Pressable>
          </View>

          {/* Meta Row: Year • Director • Runtime */}
          <View style={styles.metaRow}>
            <View style={styles.metaLeft}>
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
                  <Text style={styles.runtime}>{movie.runtime_minutes}m</Text>
                </>
              ) : null}
            </View>
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

          {/* Action Button - only show if no review yet */}
          {!userReview && (
            <Pressable
              style={({ pressed }) => [
                styles.reviewButton,
                pressed && styles.buttonPressed,
              ]}
              onPress={openReviewModal}
            >
              <Text style={styles.reviewButtonText}>Write a Review</Text>
            </Pressable>
          )}

          {/* User's Review Section */}
          {userReview && (
            <View style={styles.yourTakeSection}>
              <View style={styles.yourTakeHeader}>
                <Text style={styles.yourTakeLabel}>Your Take:</Text>
                {userRanking && (
                  <View style={styles.rankingBadge}>
                    <Text style={styles.rankingBadgeText}>#{userRanking.rank_position}</Text>
                  </View>
                )}
              </View>
              <Pressable
                style={({ pressed }) => [
                  styles.userReviewContainer,
                  pressed && styles.reviewPressed,
                ]}
                onPress={openReviewModal}
              >
                <View style={styles.reviewHeader}>
                  <View style={styles.starsRow}>
                    <StarDisplay rating={userReview.star_rating} size={16} />
                  </View>
                </View>
                {userReview.review_text ? (
                  <Text style={styles.reviewText}>{userReview.review_text}</Text>
                ) : null}
                {userReview.tagged_friends && userReview.tagged_friends.length > 0 && (
                  <FriendChipsDisplay userIds={userReview.tagged_friends} />
                )}
                {userWatchDates.length > 0 && (
                  <View style={styles.watchDatesSection}>
                    <IconSymbol name="calendar" size={14} color={Colors.textMuted} />
                    <Text style={styles.watchDatesText}>
                      Watched {userWatchDates.map(d =>
                        new Date(d.watched_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                      ).join(', ')}
                    </Text>
                  </View>
                )}
                <View style={styles.editHint}>
                  <IconSymbol name="pencil" size={12} color={Colors.textMuted} />
                  <Text style={styles.editHintText}>Tap to edit</Text>
                </View>
              </Pressable>
            </View>
          )}
        </View>

        {/* Friends' Takes Section */}
        {friendsReviews.length > 0 && (
          <View style={styles.friendsReviewsSection}>
            <Text style={styles.friendsReviewsLabel}>Friends&apos; Take:</Text>
            {friendsReviews.map((review) => (
              <View key={review.id} style={styles.friendReviewCard}>
                <View style={styles.friendReviewHeader}>
                  <Pressable
                    style={styles.friendInfo}
                    onPress={() => router.push(`/user/${review.user_id}`)}
                  >
                    <ProfileAvatar
                      imageUrl={review.users.profile_image_url}
                      username={review.users.username}
                      size="small"
                      variant="circle"
                    />
                    <Text style={styles.friendName}>
                      {review.users.display_name || review.users.username}
                    </Text>
                  </Pressable>
                  <View style={styles.starsRow}>
                    <StarDisplay rating={review.star_rating} size={12} />
                  </View>
                </View>
                {review.review_text && (
                  <Text style={styles.friendReviewText}>{review.review_text}</Text>
                )}
                {review.tagged_friends && review.tagged_friends.length > 0 && (
                  <FriendChipsDisplay userIds={review.tagged_friends} />
                )}
                {review.watchDates && review.watchDates.length > 0 && (
                  <View style={styles.watchDatesSection}>
                    <IconSymbol name="calendar" size={12} color={Colors.textMuted} />
                    <Text style={styles.watchDatesText}>
                      Watched {review.watchDates.map(d =>
                        new Date(d.watched_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                      ).join(', ')}
                    </Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Cast & Crew Section */}
        {(movie.cast?.length > 0 || movie.crew?.length > 0) && (
          <CastCrewSection cast={movie.cast || []} crew={movie.crew || []} />
        )}
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
    height: '100%',
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    justifyContent: 'flex-start',
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
    marginBottom: Spacing.xs,
  },
  ratingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  ratingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  ratingNumeric: {
    fontFamily: Fonts.serifBold,
    fontSize: FontSizes.lg,
    color: Colors.text,
  },
  ratingCount: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
  },
  noRatings: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  bookmarkButtonInline: {
    padding: Spacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  metaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    flex: 1,
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
  yourTakeSection: {
    marginTop: Spacing.lg,
  },
  yourTakeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  yourTakeLabel: {
    fontFamily: Fonts.serifSemiBold,
    fontSize: FontSizes.lg,
    color: Colors.text,
  },
  rankingBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.stamp,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankingBadgeText: {
    fontFamily: Fonts.serifBold,
    fontSize: FontSizes.sm,
    color: Colors.white,
  },
  userReviewContainer: {
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.cardBackground,
    borderRadius: BorderRadius.md,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  reviewPressed: {
    opacity: 0.8,
  },
  editHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.md,
  },
  editHintText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
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
  watchDatesSection: {
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
  friendsReviewsSection: {
    marginTop: Spacing.xl,
    paddingHorizontal: Spacing.xl,
  },
  friendsReviewsLabel: {
    fontFamily: Fonts.serifSemiBold,
    fontSize: FontSizes.lg,
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  friendReviewCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  friendReviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  friendInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  friendName: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.md,
    color: Colors.text,
  },
  friendReviewText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    lineHeight: FontSizes.sm * 1.5,
  },
});
