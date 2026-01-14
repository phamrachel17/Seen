import { View, Text, StyleSheet, Pressable, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';
import { Movie } from '@/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface MovieCardProps {
  movie: Movie;
  size?: 'small' | 'medium' | 'large';
  showInfo?: boolean;
  onPress?: () => void;
}

const CARD_SIZES = {
  small: {
    width: (SCREEN_WIDTH - Spacing.xl * 2 - Spacing.md * 2) / 3,
    aspectRatio: 2 / 3,
  },
  medium: {
    width: (SCREEN_WIDTH - Spacing.xl * 2 - Spacing.md) / 2,
    aspectRatio: 2 / 3,
  },
  large: {
    width: SCREEN_WIDTH - Spacing.xl * 2,
    aspectRatio: 2 / 3,
  },
};

export function MovieCard({ movie, size = 'small', showInfo = true, onPress }: MovieCardProps) {
  const router = useRouter();
  const cardSize = CARD_SIZES[size];

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else {
      router.push(`/movie/${movie.id}`);
    }
  };

  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        { width: cardSize.width },
        pressed && styles.pressed,
      ]}
      onPress={handlePress}
    >
      <View style={[styles.posterContainer, { aspectRatio: cardSize.aspectRatio }]}>
        {movie.poster_url ? (
          <Image
            source={{ uri: movie.poster_url }}
            style={styles.poster}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View style={styles.posterPlaceholder}>
            <Text style={styles.placeholderText}>{movie.title[0]}</Text>
          </View>
        )}
      </View>

      {showInfo && (
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={2}>
            {movie.title}
          </Text>
          <Text style={styles.meta}>
            {movie.release_year}
            {movie.director && ` \u2022 ${movie.director}`}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

// Grid variant for displaying multiple movies
interface MovieGridProps {
  movies: Movie[];
  columns?: 2 | 3;
  showInfo?: boolean;
}

export function MovieGrid({ movies, columns = 3, showInfo = true }: MovieGridProps) {
  const size = columns === 2 ? 'medium' : 'small';

  return (
    <View style={styles.grid}>
      {movies.map((movie) => (
        <MovieCard key={movie.id} movie={movie} size={size} showInfo={showInfo} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.lg,
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  posterContainer: {
    borderRadius: BorderRadius.sm,
    overflow: 'hidden',
    backgroundColor: Colors.dust,
  },
  poster: {
    width: '100%',
    height: '100%',
  },
  posterPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: Colors.dust,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontFamily: Fonts.serifBold,
    fontSize: FontSizes['2xl'],
    color: Colors.textMuted,
  },
  info: {
    marginTop: Spacing.sm,
  },
  title: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.sm,
    color: Colors.text,
    lineHeight: FontSizes.sm * 1.3,
  },
  meta: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
});
