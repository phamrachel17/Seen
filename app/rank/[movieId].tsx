import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Dimensions,
  Modal,
} from 'react-native';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { getMovieDetails, getTVShowDetails } from '@/lib/tmdb';
import {
  getUserRankingsWithRatings,
  initializeRankingStateWithTier,
  getCurrentComparison,
  processComparison,
  saveRanking,
  removeRanking,
  RankingState,
  Comparison,
  RankedMovie,
} from '@/lib/ranking';
import { useAuth } from '@/lib/auth-context';
import { useCache } from '@/lib/cache-context';
import { getUserCompletedActivity } from '@/lib/activity';
import { supabase } from '@/lib/supabase';
import { Movie, ContentType, Activity } from '@/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
// Account for: horizontal padding (Spacing.xl each side), VS divider (40px), and gaps (Spacing.md * 2)
const VS_DIVIDER_WIDTH = 40;
const CARD_WIDTH = (SCREEN_WIDTH - Spacing.xl * 2 - VS_DIVIDER_WIDTH - Spacing.md * 2) / 2;
const CARD_HEIGHT = CARD_WIDTH * 1.5;

// Star display component
function StarRating({ rating, size = 12 }: { rating: number; size?: number }) {
  return (
    <View style={styles.starsContainer}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Text
          key={star}
          style={[
            styles.starIcon,
            { fontSize: size },
            star <= rating ? styles.starFilled : styles.starEmpty,
          ]}
        >
          ★
        </Text>
      ))}
    </View>
  );
}

export default function RankingModal() {
  const { movieId, starRating: starRatingParam, contentType: contentTypeParam, replaceExisting } = useLocalSearchParams<{
    movieId: string;
    starRating?: string;
    contentType?: ContentType;
    replaceExisting?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { invalidate } = useCache();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [rankingState, setRankingState] = useState<RankingState | null>(null);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [starRating, setStarRating] = useState<number>(3);
  const [contentType, setContentType] = useState<ContentType>('movie');
  const [detailPopup, setDetailPopup] = useState<{
    visible: boolean;
    movie: RankedMovie | Movie | null;
    activity: Activity | null;
    isNew: boolean;
    totalCount: number;
  } | null>(null);

  useEffect(() => {
    if (movieId && user) {
      console.log(`[Rank Screen] URL params: starRatingParam=${starRatingParam}, contentTypeParam=${contentTypeParam}`);
      const rating = starRatingParam ? parseInt(starRatingParam, 10) : 3;
      console.log(`[Rank Screen] Parsed rating=${rating}`);
      const type = contentTypeParam || 'movie';
      setStarRating(rating);
      setContentType(type);
      initializeRanking(parseInt(movieId, 10), rating, type);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movieId, user, starRatingParam, contentTypeParam]);

  const initializeRanking = async (id: number, rating: number, type: ContentType) => {
    try {
      console.log(`[Rank Screen] initializeRanking: id=${id}, rating=${rating}, type=${type}`);
      setIsLoading(true);

      // Fetch the content to rank (movie or TV show)
      const movie = type === 'tv'
        ? await getTVShowDetails(id)
        : await getMovieDetails(id);

      // Fetch user's existing rankings with star ratings for this content type
      const existingRankings = await getUserRankingsWithRatings(user!.id, type);

      // Initialize ranking state with tier awareness
      const state = initializeRankingStateWithTier(movie, rating, existingRankings);
      setRankingState(state);

      if (state.isComplete) {
        // No comparisons needed (first movie in tier)
        await finishRanking(state, rating, type);
      } else {
        // Get first comparison
        setComparison(getCurrentComparison(state));
      }
    } catch (error) {
      console.error('Error initializing ranking:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChoice = async (prefersNewMovie: boolean) => {
    if (!rankingState) return;

    const newState = processComparison(rankingState, prefersNewMovie);
    setRankingState(newState);

    if (newState.isComplete) {
      await finishRanking(newState, starRating, contentType);
    } else {
      setComparison(getCurrentComparison(newState));
    }
  };

  const finishRanking = async (state: RankingState, rating: number, type: ContentType) => {
    console.log(`[Rank Screen] finishRanking: tierPosition=${state.tierPosition}, rating=${rating}, state.starRating=${state.starRating}`);
    setIsSaving(true);

    try {
      // If replacing an existing ranking (rating changed), remove the old one first
      // This is done here (not in review screen) to prevent data loss if navigation failed
      if (replaceExisting === 'true') {
        await removeRanking(user!.id, state.newMovie.id, type);
      }

      await saveRanking(user!.id, state.newMovie, state.tierPosition, rating, type);
      // Invalidate caches on successful ranking creation
      invalidate('ranking_create', user!.id);
      // Navigate to lists quickly
      setTimeout(() => {
        router.replace('/(tabs)/lists');
      }, 600);
    } catch (error) {
      console.error('Error saving ranking:', error);
      setIsSaving(false);
    }
  };

  // Helper for score badge color
  const getScoreColor = (score: number) => {
    if (score >= 8.0) return Colors.stamp;
    if (score >= 6.0) return Colors.settledTea;
    return Colors.textMuted;
  };

  // Handle long-press to show rating details
  const handleLongPress = async (movie: RankedMovie | Movie, isNew: boolean) => {
    if (isNew) {
      // New movie - just show the star rating being given
      setDetailPopup({
        visible: true,
        movie,
        activity: null,
        isNew: true,
        totalCount: 0,
      });
      return;
    }

    // Existing movie - fetch activity data
    const rankedMovie = movie as RankedMovie;

    // Get content_id from content table
    const { data: contentData } = await supabase
      .from('content')
      .select('id')
      .eq('tmdb_id', rankedMovie.id)
      .single();

    let activity = null;
    if (contentData) {
      activity = await getUserCompletedActivity(user!.id, contentData.id);
    }

    // Get total count for context
    const { count } = await supabase
      .from('rankings')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user!.id)
      .eq('content_type', contentType);

    setDetailPopup({
      visible: true,
      movie: rankedMovie,
      activity,
      isNew: false,
      totalCount: count || 0,
    });
  };

  // Get tier movie count for context
  const tierMovieCount = rankingState?.tierMovies.length || 0;

  if (isLoading) {
    return <LoadingScreen message="Loading your rankings..." />;
  }

  // Show completion state
  if (rankingState?.isComplete) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.completionContainer}>
          {isSaving ? (
            <>
              <ActivityIndicator size="large" color={Colors.stamp} />
              <Text style={styles.savingText}>Saving your ranking...</Text>
            </>
          ) : (
            <>
              <Text style={styles.completionTitle}>Ranked!</Text>
              <View style={styles.rankBadge}>
                <Text style={styles.rankNumber}>#{rankingState.tierPosition}</Text>
              </View>
              <Text style={styles.movieTitle}>{rankingState.newMovie.title}</Text>
              <View style={styles.tierContext}>
                <StarRating rating={starRating} size={16} />
                <Text style={styles.completionSubtitle}>
                  {tierMovieCount === 0
                    ? `Your first ${starRating}-star film!`
                    : `Ranked #${rankingState.tierPosition} of ${tierMovieCount + 1} ${starRating}-star films`}
                </Text>
              </View>
            </>
          )}
        </View>
      </View>
    );
  }

  // Show comparison UI
  if (!comparison || !rankingState) {
    return (
      <View style={[styles.errorContainer, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Something went wrong</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backLink}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.closeButton}>
          <IconSymbol name="xmark" size={24} color={Colors.text} />
        </Pressable>
        <View style={styles.progressContainer}>
          <Text style={styles.progressText}>
            Comparison {comparison.currentIndex} of ~{comparison.totalComparisons}
          </Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {/* Header Section - Fixed at top */}
      <View style={styles.headerSection}>
        {/* Context */}
        <View style={styles.tierContextHeader}>
          <Text style={styles.tierContextText}>
            Comparing with <Text style={styles.tierCountText}>{rankingState?.tierMovies.length || 0}</Text> other {'★'.repeat(starRating)} {(rankingState?.tierMovies.length || 0) === 1 ? 'film' : 'films'}
          </Text>
        </View>

        {/* Question */}
        <View style={styles.questionContainer}>
          <Text style={styles.questionText}>Which do you prefer?</Text>
        </View>
      </View>

      {/* Center Section - Cards centered in remaining space */}
      <View style={styles.centerSection}>
        {/* Comparison Cards */}
        <View style={styles.comparisonContainer}>
        {/* New Movie (A) */}
        <Pressable
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
          onPress={() => handleChoice(true)}
          onLongPress={() => handleLongPress(comparison.movieA, true)}
          delayLongPress={400}
        >
          {comparison.movieA.poster_url ? (
            <Image
              source={{ uri: comparison.movieA.poster_url }}
              style={styles.cardPoster}
              contentFit="cover"
            />
          ) : (
            <View style={styles.cardPlaceholder}>
              <Text style={styles.placeholderText}>{comparison.movieA.title[0]}</Text>
            </View>
          )}
          <View style={styles.cardInfo}>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {comparison.movieA.title}
            </Text>
            <Text style={styles.cardYear}>{comparison.movieA.release_year}</Text>
          </View>
          <View style={styles.newBadge}>
            <Text style={styles.newBadgeText}>NEW</Text>
          </View>
        </Pressable>

        {/* VS Divider */}
        <View style={styles.vsDivider}>
          <Text style={styles.vsText}>VS</Text>
        </View>

        {/* Existing Movie (B) */}
        <Pressable
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
          onPress={() => handleChoice(false)}
          onLongPress={() => handleLongPress(comparison.movieB, false)}
          delayLongPress={400}
        >
          {comparison.movieB.poster_url ? (
            <Image
              source={{ uri: comparison.movieB.poster_url }}
              style={styles.cardPoster}
              contentFit="cover"
            />
          ) : (
            <View style={styles.cardPlaceholder}>
              <Text style={styles.placeholderText}>{comparison.movieB.title[0]}</Text>
            </View>
          )}
          <View style={styles.cardInfo}>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {comparison.movieB.title}
            </Text>
            <Text style={styles.cardYear}>{comparison.movieB.release_year}</Text>
          </View>
          <View style={styles.rankIndicator}>
            <Text style={styles.rankIndicatorText}>
              #{comparison.movieB.ranking?.rank_position || '?'}
            </Text>
          </View>
        </Pressable>
        </View>

        {/* Instructions */}
        <View style={styles.instructionsContainer}>
          <Text style={styles.instructionsText}>
            Tap the film you like more • Hold for details
          </Text>
        </View>
      </View>

      {/* Rating Detail Popup */}
      <Modal
        visible={detailPopup?.visible || false}
        transparent
        animationType="fade"
        onRequestClose={() => setDetailPopup(null)}
      >
        <Pressable
          style={styles.popupOverlay}
          onPress={() => setDetailPopup(null)}
        >
          <View style={styles.popupContent}>
            {detailPopup && (
              <>
                <Text style={styles.popupTitle}>
                  {detailPopup.movie?.title}
                </Text>

                {detailPopup.isNew ? (
                  <View style={styles.popupSection}>
                    <Text style={styles.popupLabel}>Your new rating:</Text>
                    <StarRating rating={starRating} size={20} />
                  </View>
                ) : (
                  <>
                    {/* Star Rating */}
                    <View style={styles.popupSection}>
                      <StarRating
                        rating={(detailPopup.movie as RankedMovie).star_rating}
                        size={20}
                      />
                    </View>

                    {/* Score & Position */}
                    <View style={styles.popupScoreRow}>
                      <View style={[
                        styles.popupScoreBadge,
                        { borderColor: getScoreColor((detailPopup.movie as RankedMovie).ranking.display_score) }
                      ]}>
                        <Text style={[
                          styles.popupScoreText,
                          { color: getScoreColor((detailPopup.movie as RankedMovie).ranking.display_score) }
                        ]}>
                          {(detailPopup.movie as RankedMovie).ranking.display_score.toFixed(1)}
                        </Text>
                      </View>
                      <Text style={styles.popupPositionText}>
                        #{(detailPopup.movie as RankedMovie).ranking.rank_position}
                        {detailPopup.totalCount > 0 && ` of ${detailPopup.totalCount}`}
                      </Text>
                    </View>

                    {/* Review Text */}
                    {detailPopup.activity?.review_text && (
                      <View style={styles.popupSection}>
                        <Text style={styles.popupReviewText}>
                          "{detailPopup.activity.review_text}"
                        </Text>
                      </View>
                    )}
                  </>
                )}

                <Text style={styles.popupHint}>Tap anywhere to close</Text>
              </>
            )}
          </View>
        </Pressable>
      </Modal>
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
  loadingText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.textMuted,
    marginTop: Spacing.lg,
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressContainer: {
    alignItems: 'center',
  },
  progressText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
  },
  headerSpacer: {
    width: 40,
  },
  headerSection: {
    alignItems: 'center',
    paddingTop: Spacing.md,
  },
  centerSection: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 80,
  },
  tierContextHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.cardBackground,
    marginBottom: Spacing.md,
    borderRadius: BorderRadius.sm,
  },
  tierContextText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
  },
  tierCountText: {
    fontFamily: Fonts.sansSemiBold,
    color: Colors.text,
  },
  questionContainer: {
    alignItems: 'center',
  },
  questionText: {
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes['2xl'],
    color: Colors.text,
  },
  comparisonContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  card: {
    width: CARD_WIDTH,
    backgroundColor: Colors.cardBackground,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  cardPressed: {
    transform: [{ scale: 0.98 }],
    shadowOpacity: 0.15,
  },
  cardPoster: {
    width: '100%',
    height: CARD_HEIGHT,
  },
  cardPlaceholder: {
    width: '100%',
    height: CARD_HEIGHT,
    backgroundColor: Colors.dust,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontFamily: Fonts.serifBold,
    fontSize: FontSizes['3xl'],
    color: Colors.textMuted,
  },
  cardInfo: {
    padding: Spacing.md,
  },
  cardTitle: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.sm,
    color: Colors.text,
    marginBottom: 2,
  },
  cardYear: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
  },
  newBadge: {
    position: 'absolute',
    top: Spacing.sm,
    left: Spacing.sm,
    backgroundColor: Colors.stamp,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  newBadgeText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.xs,
    color: Colors.white,
    letterSpacing: 0.5,
  },
  rankIndicator: {
    position: 'absolute',
    top: Spacing.sm,
    left: Spacing.sm,
    backgroundColor: Colors.navy,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  rankIndicatorText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.xs,
    color: Colors.white,
  },
  vsDivider: {
    width: VS_DIVIDER_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vsText: {
    fontFamily: Fonts.serifBold,
    fontSize: FontSizes.lg,
    color: Colors.textMuted,
  },
  instructionsContainer: {
    alignItems: 'center',
    paddingVertical: Spacing['2xl'],
  },
  instructionsText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
  },
  completionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  completionTitle: {
    fontFamily: Fonts.serifBold,
    fontSize: FontSizes['4xl'],
    color: Colors.stamp,
    marginBottom: Spacing.lg,
  },
  rankBadge: {
    width: 100,
    height: 100,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.stamp,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
  },
  rankNumber: {
    fontFamily: Fonts.serifBold,
    fontSize: FontSizes['3xl'],
    color: Colors.white,
  },
  movieTitle: {
    fontFamily: Fonts.serifSemiBold,
    fontSize: FontSizes['2xl'],
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  tierContext: {
    alignItems: 'center',
    gap: Spacing.xs,
  },
  completionSubtitle: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.textMuted,
  },
  savingText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.textMuted,
    marginTop: Spacing.lg,
  },
  starsContainer: {
    flexDirection: 'row',
    gap: 2,
  },
  starIcon: {
    fontFamily: Fonts.sans,
  },
  starFilled: {
    color: Colors.stamp,
  },
  starEmpty: {
    color: Colors.dust,
  },
  popupOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  popupContent: {
    backgroundColor: Colors.cardBackground,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    width: '100%',
    maxWidth: 320,
  },
  popupTitle: {
    fontFamily: Fonts.serifSemiBold,
    fontSize: FontSizes.xl,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  popupSection: {
    marginBottom: Spacing.md,
    alignItems: 'center',
  },
  popupLabel: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
    marginBottom: Spacing.xs,
  },
  popupScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  popupScoreBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  popupScoreText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.md,
  },
  popupPositionText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.lg,
    color: Colors.text,
  },
  popupReviewText: {
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: FontSizes.md * 1.5,
  },
  popupHint: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Spacing.lg,
  },
});
