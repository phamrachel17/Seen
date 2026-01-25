import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Movie } from '@/types';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SPOTLIGHT_HEIGHT = Math.round(SCREEN_HEIGHT * 0.50);

// High-quality backdrop URL (upgrade from w780 to w1280)
function getHighQualityBackdrop(url: string | null): string | null {
  if (!url) return null;
  return url.replace('/w780/', '/w1280/');
}

// Fallback blurhash for smooth loading
const FALLBACK_BLURHASH = 'L6PZfSi_.AyE_3t7t7R**0o#DgR4';

interface SpotlightProps {
  movie: Movie | null;
  isLoading: boolean;
  onPress: () => void;
}

export function VideoSpotlight({
  movie,
  isLoading,
  onPress,
}: SpotlightProps) {
  // Loading state
  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.stamp} />
        </View>
      </View>
    );
  }

  // No movie state
  if (!movie) {
    return null;
  }

  // Get high-quality backdrop URL
  const highQualityBackdrop = getHighQualityBackdrop(movie.backdrop_url);

  return (
    <Pressable style={styles.container} onPress={onPress}>
      {/* Backdrop Image - High Quality */}
      {highQualityBackdrop ? (
        <Image
          source={{ uri: highQualityBackdrop }}
          style={styles.backdropImage}
          contentFit="cover"
          transition={500}
          placeholder={FALLBACK_BLURHASH}
        />
      ) : movie.poster_url ? (
        <Image
          source={{ uri: movie.poster_url }}
          style={styles.backdropImage}
          contentFit="cover"
          transition={500}
          placeholder={FALLBACK_BLURHASH}
        />
      ) : (
        <View style={styles.placeholderBackdrop}>
          <Text style={styles.placeholderText}>{movie.title[0]}</Text>
        </View>
      )}

      {/* Premium Gradient Overlay - Smoother with vignette effect */}
      <LinearGradient
        colors={[
          'rgba(0,0,0,0.15)',
          'transparent',
          'transparent',
          'rgba(0,0,0,0.5)',
          Colors.background,
        ]}
        locations={[0, 0.2, 0.5, 0.8, 1]}
        style={styles.gradient}
      />

      {/* Content Overlay */}
      <View style={styles.contentOverlay}>
        {/* Title and Meta */}
        <View style={styles.titleContainer}>
          <Text style={styles.title} numberOfLines={2}>
            {movie.title}
          </Text>
          <View style={styles.metaRow}>
            {movie.release_year ? (
              <Text style={styles.metaText}>{movie.release_year}</Text>
            ) : null}
            {movie.genres && movie.genres.length > 0 && (
              <>
                <Text style={styles.metaDot}>•</Text>
                <Text style={styles.metaText} numberOfLines={1}>
                  {movie.genres.slice(0, 2).join(', ')}
                </Text>
              </>
            )}
            {movie.runtime_minutes && (
              <>
                <Text style={styles.metaDot}>•</Text>
                <Text style={styles.metaText}>{movie.runtime_minutes}m</Text>
              </>
            )}
          </View>
        </View>

        {/* More Info Button - Glass effect style */}
        <Pressable style={styles.moreInfoButton} onPress={onPress}>
          <IconSymbol name="info.circle" size={16} color={Colors.white} />
          <Text style={styles.moreInfoText}>More Info</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SCREEN_WIDTH,
    height: SPOTLIGHT_HEIGHT,
    backgroundColor: Colors.black,
    position: 'relative',
    marginBottom: Spacing.lg,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.cardBackground,
  },
  backdropImage: {
    ...StyleSheet.absoluteFillObject,
  },
  placeholderBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.dust,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontFamily: Fonts.serifBold,
    fontSize: FontSizes['5xl'],
    color: Colors.textMuted,
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },
  contentOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
  },
  titleContainer: {
    marginBottom: Spacing.md,
  },
  title: {
    fontFamily: Fonts.serifBold,
    fontSize: FontSizes['4xl'],
    letterSpacing: -0.5,
    color: Colors.white,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
    marginBottom: Spacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  metaText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.white,
    opacity: 0.85,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  metaDot: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.white,
    opacity: 0.6,
    marginHorizontal: Spacing.sm,
  },
  moreInfoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
  },
  moreInfoText: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.sm,
    color: Colors.white,
  },
});
