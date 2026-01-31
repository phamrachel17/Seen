import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ScrollView,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  Colors,
  Fonts,
  FontSizes,
  Spacing,
  BorderRadius,
} from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { SeenLoader } from '@/components/ui/seen-loader';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import {
  getPickForMe,
  updatePickOutcome,
  generateSessionId,
} from '@/lib/pick-for-me';
import { ensureContentExists } from '@/lib/content';
import {
  ContentType,
  PickFilters,
  PickSuggestion,
  Movie,
  TVShow,
  ExternalRatings,
} from '@/types';
import { getMovieDetails, getTVShowDetails } from '@/lib/tmdb';
import { getExternalRatings } from '@/lib/omdb';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Genre options
const GENRE_OPTIONS = [
  { id: 'action', label: 'Action' },
  { id: 'comedy', label: 'Comedy' },
  { id: 'drama', label: 'Drama' },
  { id: 'horror', label: 'Horror' },
  { id: 'romance', label: 'Romance' },
  { id: 'scifi', label: 'Sci-Fi' },
  { id: 'thriller', label: 'Thriller' },
  { id: 'documentary', label: 'Documentary' },
  { id: 'animation', label: 'Animation' },
  { id: 'crime', label: 'Crime' },
  { id: 'mystery', label: 'Mystery' },
  { id: 'fantasy', label: 'Fantasy' },
];

interface PickForMeModalProps {
  visible: boolean;
  onClose: () => void;
  initialContentType?: ContentType;
}

type ModalStep = 'filters' | 'loading' | 'result';

export function PickForMeModal({ visible, onClose, initialContentType = 'movie' }: PickForMeModalProps) {
  const router = useRouter();
  const { user } = useAuth();

  // Flow state
  const [step, setStep] = useState<ModalStep>('filters');
  const [sessionId, setSessionId] = useState<string>('');

  // Filter state
  const [contentType, setContentType] = useState<ContentType>(initialContentType);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);

  // Result state
  const [suggestion, setSuggestion] = useState<PickSuggestion | null>(null);
  const [hasMorePicks, setHasMorePicks] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [externalRatings, setExternalRatings] = useState<ExternalRatings | null>(null);
  const [seenRating, setSeenRating] = useState<number | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setStep('filters');
      setSessionId(generateSessionId());
      setContentType(initialContentType);
      setSelectedGenres([]);
      setSuggestion(null);
      setErrorMessage(null);
      setExternalRatings(null);
      setSeenRating(null);
    }
  }, [visible, initialContentType]);

  const toggleGenre = (genreId: string) => {
    setSelectedGenres((prev) =>
      prev.includes(genreId)
        ? prev.filter((g) => g !== genreId)
        : [...prev, genreId]
    );
  };

  // Fetch external ratings and Seen community rating when result is shown
  useEffect(() => {
    if (step !== 'result' || !suggestion) return;

    const fetchRatings = async () => {
      const content = suggestion.content;
      const suggestionContentType = suggestion.contentType;

      // 1. Fetch external ratings (IMDb, RT) - need to get imdb_id from details
      try {
        if (suggestionContentType === 'movie') {
          const details = await getMovieDetails(content.id);
          if (details?.imdb_id) {
            const ratings = await getExternalRatings(details.imdb_id);
            setExternalRatings(ratings);
          }
        } else {
          const details = await getTVShowDetails(content.id);
          if (details?.imdb_id) {
            const ratings = await getExternalRatings(details.imdb_id);
            setExternalRatings(ratings);
          }
        }
      } catch (error) {
        console.error('Error fetching external ratings:', error);
      }

      // 2. Fetch Seen community average rating
      try {
        const { data: contentData } = await supabase
          .from('content')
          .select('id')
          .eq('tmdb_id', content.id)
          .eq('content_type', suggestionContentType)
          .single();

        if (contentData) {
          const { data: activities } = await supabase
            .from('activity_log')
            .select('star_rating')
            .eq('content_id', contentData.id)
            .eq('status', 'completed')
            .not('star_rating', 'is', null);

          if (activities && activities.length > 0) {
            const avg = activities.reduce((sum, a) => sum + (a.star_rating || 0), 0) / activities.length;
            setSeenRating(avg);
          }
        }
      } catch (error) {
        console.error('Error fetching Seen rating:', error);
      }
    };

    fetchRatings();
  }, [step, suggestion]);

  const handlePickForMe = async () => {
    if (!user) return;

    setStep('loading');
    setErrorMessage(null);

    const filters: PickFilters = {
      contentType,
      genres: selectedGenres.length > 0 ? selectedGenres : undefined,
    };

    const result = await getPickForMe(user.id, filters, sessionId);

    if (result) {
      setSuggestion(result.suggestion);
      setHasMorePicks(result.alternatesAvailable);
      setStep('result');
    } else {
      setErrorMessage('No recommendations found. Try adjusting your filters.');
      setStep('filters');
    }
  };

  const handlePickAgain = async () => {
    if (!suggestion) return;

    await updatePickOutcome(suggestion.id, 'skipped');
    handlePickForMe();
  };

  const handleAccept = async () => {
    if (!suggestion) return;

    await updatePickOutcome(suggestion.id, 'accepted');
    onClose();

    const content = suggestion.content as Movie | TVShow;
    router.push(`/title/${content.id}?type=${suggestion.contentType}`);
  };

  const handleSaveForLater = async () => {
    if (!suggestion || !user || isSaving) return;

    setIsSaving(true);

    try {
      // Ensure content exists and get the database ID
      const dbContent = await ensureContentExists(
        (suggestion.content as Movie | TVShow).id,
        suggestion.contentType
      );

      if (dbContent) {
        // Create bookmark using content_id
        await supabase.from('bookmarks').insert({
          user_id: user.id,
          content_id: dbContent.id,
        });
      }

      await updatePickOutcome(suggestion.id, 'saved');
      onClose();
    } catch (error) {
      console.error('Error saving to watchlist:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const content = suggestion?.content as Movie | TVShow | undefined;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerSpacer} />
          <Text style={styles.headerTitle}>Pick for Me</Text>
          <Pressable style={styles.closeButton} onPress={onClose}>
            <IconSymbol name="xmark" size={20} color={Colors.text} />
          </Pressable>
        </View>

        {step === 'filters' && (
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.filterContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Feature explanation */}
            <Text style={styles.subtitle}>
              Can't decide what to watch? We'll suggest something based on your taste and what your friends love.
            </Text>

            {/* Error Message */}
            {errorMessage && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            )}

            {/* Content Type Toggle */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>I want to watch a</Text>
              <View style={styles.contentTypeToggle}>
                <Pressable
                  style={[
                    styles.contentTypeButton,
                    contentType === 'movie' && styles.contentTypeButtonActive,
                  ]}
                  onPress={() => setContentType('movie')}
                >
                  <Text
                    style={[
                      styles.contentTypeText,
                      contentType === 'movie' && styles.contentTypeTextActive,
                    ]}
                  >
                    Movie
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.contentTypeButton,
                    contentType === 'tv' && styles.contentTypeButtonActive,
                  ]}
                  onPress={() => setContentType('tv')}
                >
                  <Text
                    style={[
                      styles.contentTypeText,
                      contentType === 'tv' && styles.contentTypeTextActive,
                    ]}
                  >
                    TV Show
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Genre Selection (Optional) */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Genre (optional)</Text>
              <View style={styles.chipContainer}>
                {GENRE_OPTIONS.map((genre) => (
                  <Pressable
                    key={genre.id}
                    style={[
                      styles.chip,
                      selectedGenres.includes(genre.id) && styles.chipSelected,
                    ]}
                    onPress={() => toggleGenre(genre.id)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        selectedGenres.includes(genre.id) && styles.chipTextSelected,
                      ]}
                    >
                      {genre.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Pick Button */}
            <Pressable style={styles.pickButton} onPress={handlePickForMe}>
              <IconSymbol name="sparkles" size={20} color={Colors.paper} />
              <Text style={styles.pickButtonText}>Pick for Me</Text>
            </Pressable>
          </ScrollView>
        )}

        {step === 'loading' && (
          <View style={styles.loadingContainer}>
            <SeenLoader size={64} />
            <Text style={styles.loadingText}>Finding the perfect pick...</Text>
          </View>
        )}

        {step === 'result' && content && suggestion && (
          <View style={styles.resultContainer}>
            {/* Hero Image */}
            <View style={styles.heroContainer}>
              {content.backdrop_url ? (
                <Image
                  source={{ uri: content.backdrop_url }}
                  style={styles.heroImage}
                  contentFit="cover"
                  transition={300}
                />
              ) : content.poster_url ? (
                <Image
                  source={{ uri: content.poster_url }}
                  style={styles.heroImage}
                  contentFit="cover"
                  transition={300}
                />
              ) : (
                <View style={styles.heroPlaceholder}>
                  <Text style={styles.heroPlaceholderText}>
                    {content.title[0]}
                  </Text>
                </View>
              )}
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.6)', Colors.background]}
                locations={[0, 0.6, 1]}
                style={styles.heroGradient}
              />
              {/* Ratings Overlay - Top Right of Poster */}
              {(externalRatings?.imdb || externalRatings?.rottenTomatoes || seenRating !== null) && (
                <View style={styles.ratingsOverlay}>
                  {/* IMDb Rating */}
                  {externalRatings?.imdb?.rating && (
                    <View style={styles.ratingItem}>
                      <Image
                        source={require('@/assets/images/imdb-logo.png')}
                        style={styles.imdbLogo}
                        contentFit="contain"
                      />
                      <Text style={styles.ratingValue}>{externalRatings.imdb.rating}</Text>
                    </View>
                  )}

                  {/* Rotten Tomatoes */}
                  {externalRatings?.rottenTomatoes?.score && (
                    <View style={styles.ratingItem}>
                      <Image
                        source={require('@/assets/images/rotten-tomatoes-logo.png')}
                        style={styles.rtLogo}
                        contentFit="contain"
                      />
                      <Text style={styles.ratingValue}>{externalRatings.rottenTomatoes.score}</Text>
                    </View>
                  )}

                  {/* Seen Community Rating */}
                  {seenRating !== null && (
                    <View style={styles.ratingItem}>
                      <IconSymbol name="star.fill" size={14} color={Colors.stamp} />
                      <Text style={styles.ratingValue}>{seenRating.toFixed(1)}</Text>
                    </View>
                  )}
                </View>
              )}
            </View>

            {/* Content Info */}
            <View style={styles.resultContent}>
              <Text style={styles.resultTitle}>{content.title}</Text>

              <View style={styles.metaRow}>
                {content.release_year ? (
                  <Text style={styles.metaText}>{content.release_year}</Text>
                ) : null}
                {content.genres && content.genres.length > 0 && (
                  <>
                    <Text style={styles.metaDot}>•</Text>
                    <Text style={styles.metaText}>
                      {content.genres.slice(0, 2).join(', ')}
                    </Text>
                  </>
                )}
                {'runtime_minutes' in content && content.runtime_minutes && (
                  <>
                    <Text style={styles.metaDot}>•</Text>
                    <Text style={styles.metaText}>
                      {content.runtime_minutes}m
                    </Text>
                  </>
                )}
              </View>

              {/* Explanation */}
              <View style={styles.explanationContainer}>
                <IconSymbol
                  name={
                    suggestion.explanation.type === 'friend_loved'
                      ? 'heart.fill'
                      : suggestion.explanation.type === 'friend_watched'
                        ? 'person.fill'
                        : suggestion.explanation.type === 'genre_match'
                          ? 'tag.fill'
                          : suggestion.explanation.type === 'trending'
                            ? 'flame.fill'
                            : 'star.fill'
                  }
                  size={14}
                  color={Colors.stamp}
                />
                <Text style={styles.explanationText}>
                  {suggestion.explanation.text}
                </Text>
              </View>

              {/* Synopsis */}
              {suggestion.content.synopsis && (
                <View style={styles.synopsisContainer}>
                  <Text style={styles.synopsisText} numberOfLines={4}>
                    {suggestion.content.synopsis}
                  </Text>
                </View>
              )}

              {/* Action Buttons */}
              <View style={styles.actionButtons}>
                <Pressable style={styles.primaryButton} onPress={handleAccept}>
                  <Text style={styles.primaryButtonText}>More Details</Text>
                </Pressable>

                <View style={styles.secondaryButtons}>
                  <Pressable
                    style={styles.secondaryButton}
                    onPress={handleSaveForLater}
                    disabled={isSaving}
                  >
                    <IconSymbol name="bookmark" size={18} color={Colors.text} />
                    <Text style={styles.secondaryButtonText}>
                      {isSaving ? 'Saving...' : 'Save'}
                    </Text>
                  </Pressable>

                  {hasMorePicks && (
                    <Pressable
                      style={styles.secondaryButton}
                      onPress={handlePickAgain}
                    >
                      <IconSymbol
                        name="arrow.trianglehead.2.clockwise"
                        size={18}
                        color={Colors.text}
                      />
                      <Text style={styles.secondaryButtonText}>Pick Again</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.md,
  },
  headerSpacer: {
    width: 36,
  },
  headerTitle: {
    fontFamily: Fonts.serifBold,
    fontSize: FontSizes.lg,
    color: Colors.text,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dust,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  filterContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing['3xl'],
  },
  subtitle: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: Spacing.xl,
    lineHeight: 20,
  },
  errorContainer: {
    backgroundColor: Colors.error + '20',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.lg,
  },
  errorText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.error,
    textAlign: 'center',
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionLabel: {
    fontFamily: Fonts.serifSemiBold,
    fontSize: FontSizes.lg,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  contentTypeToggle: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  contentTypeButton: {
    flex: 1,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  contentTypeButtonActive: {
    backgroundColor: Colors.stamp,
    borderColor: Colors.stamp,
  },
  contentTypeText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.md,
    color: Colors.text,
  },
  contentTypeTextActive: {
    color: Colors.paper,
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: 'transparent',
  },
  chipSelected: {
    backgroundColor: Colors.stamp,
    borderColor: Colors.stamp,
  },
  chipText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.text,
  },
  chipTextSelected: {
    color: Colors.paper,
  },
  pickButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.stamp,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.xl,
    gap: Spacing.sm,
  },
  pickButtonText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.md,
    color: Colors.paper,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xl,
  },
  loadingText: {
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.lg,
    color: Colors.textMuted,
  },
  resultContainer: {
    flex: 1,
  },
  heroContainer: {
    height: SCREEN_HEIGHT * 0.4,
    position: 'relative',
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
  },
  heroPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.dust,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroPlaceholderText: {
    fontFamily: Fonts.serifBold,
    fontSize: FontSizes['5xl'],
    color: Colors.textMuted,
  },
  heroGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  ratingsOverlay: {
    position: 'absolute',
    top: Spacing.xl,
    right: Spacing.xl,
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  ratingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    gap: 4,
  },
  imdbLogo: {
    width: 36,
    height: 18,
  },
  rtLogo: {
    width: 16,
    height: 16,
  },
  ratingValue: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.sm,
    color: Colors.paper,
  },
  resultContent: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    marginTop: -Spacing['2xl'],
  },
  resultTitle: {
    fontFamily: Fonts.serifBold,
    fontSize: FontSizes['3xl'],
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  metaText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
  },
  metaDot: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
    marginHorizontal: Spacing.xs,
  },
  explanationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardBackground,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xl,
    gap: Spacing.sm,
  },
  explanationText: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.sm,
    color: Colors.text,
  },
  synopsisContainer: {
    marginBottom: Spacing.xl,
  },
  synopsisText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
    lineHeight: 20,
  },
  actionButtons: {
    gap: Spacing.md,
  },
  primaryButton: {
    backgroundColor: Colors.stamp,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.md,
    color: Colors.paper,
  },
  secondaryButtons: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  secondaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
  },
  secondaryButtonText: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.sm,
    color: Colors.text,
  },
});
