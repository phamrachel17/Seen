import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { getMovieDetails } from '@/lib/tmdb';
import {
  getUserRankingsWithRatings,
  initializeRankingStateWithTier,
  getCurrentComparison,
  processComparison,
  saveRanking,
  RankingState,
  Comparison,
  RankedMovie,
} from '@/lib/ranking';
import { useAuth } from '@/lib/auth-context';
import { Movie } from '@/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = (SCREEN_WIDTH - Spacing.xl * 2 - Spacing.lg) / 2;
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
  const { movieId, starRating: starRatingParam } = useLocalSearchParams<{
    movieId: string;
    starRating?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [rankingState, setRankingState] = useState<RankingState | null>(null);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [starRating, setStarRating] = useState<number>(3);

  useEffect(() => {
    if (movieId && user) {
      const rating = starRatingParam ? parseInt(starRatingParam, 10) : 3;
      setStarRating(rating);
      initializeRanking(parseInt(movieId, 10), rating);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movieId, user, starRatingParam]);

  const initializeRanking = async (id: number, rating: number) => {
    try {
      setIsLoading(true);

      // Fetch the movie to rank
      const movie = await getMovieDetails(id);

      // Fetch user's existing rankings with star ratings
      const existingRankings = await getUserRankingsWithRatings(user!.id);

      // Initialize ranking state with tier awareness
      const state = initializeRankingStateWithTier(movie, rating, existingRankings);
      setRankingState(state);

      if (state.isComplete) {
        // No comparisons needed (first movie in tier)
        await finishRanking(state, rating);
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
      await finishRanking(newState, starRating);
    } else {
      setComparison(getCurrentComparison(newState));
    }
  };

  const finishRanking = async (state: RankingState, rating: number) => {
    setIsSaving(true);

    try {
      await saveRanking(user!.id, state.newMovie, state.tierPosition, rating);
      // Navigate to lists quickly
      setTimeout(() => {
        router.replace('/(tabs)/lists');
      }, 600);
    } catch (error) {
      console.error('Error saving ranking:', error);
      setIsSaving(false);
    }
  };

  // Get tier movie count for context
  const tierMovieCount = rankingState?.tierMovies.length || 0;

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.stamp} />
        <Text style={styles.loadingText}>Loading your rankings...</Text>
      </View>
    );
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

      {/* Context */}
      <View style={styles.tierContextHeader}>
        <Text style={styles.tierContextText}>
          Ranking among your {rankingState?.tierMovies.length || 0} {starRating}-star films
        </Text>
      </View>

      {/* Question */}
      <View style={styles.questionContainer}>
        <Text style={styles.questionText}>Which do you prefer?</Text>
      </View>

      {/* Comparison Cards */}
      <View style={styles.comparisonContainer}>
        {/* New Movie (A) */}
        <Pressable
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
          onPress={() => handleChoice(true)}
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
          Tap the film you like more
        </Text>
      </View>
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
  tierContextHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.cardBackground,
    marginHorizontal: Spacing.xl,
    borderRadius: BorderRadius.sm,
  },
  tierContextText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
  },
  questionContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
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
    paddingHorizontal: Spacing.xl,
    flex: 1,
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
    width: 40,
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
});
