import React from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';
import { Movie, TVShow, ContentType } from '@/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Calculate available width after padding
const CONTENT_WIDTH = SCREEN_WIDTH - Spacing.xl * 2;
const GAP = Spacing.sm; // Gap between cards

// Combined type that works for both movies and TV shows
type ContentItem = (Movie | TVShow) & { content_type?: ContentType };

interface MovieCardProps {
  movie: ContentItem;
  size?: 'small' | 'medium' | 'large';
  showInfo?: boolean;
  onPress?: () => void;
  contentType?: ContentType;
}

const CARD_SIZES = {
  small: {
    // 3 columns: (contentWidth - 2 gaps) / 3
    width: (CONTENT_WIDTH - GAP * 2) / 3,
    aspectRatio: 2 / 3,
  },
  medium: {
    // 2 columns: (contentWidth - 1 gap) / 2
    width: (CONTENT_WIDTH - GAP) / 2,
    aspectRatio: 2 / 3,
  },
  large: {
    width: CONTENT_WIDTH,
    aspectRatio: 2 / 3,
  },
};

export const MovieCard = React.memo(function MovieCard({
  movie,
  size = 'small',
  showInfo = true,
  onPress,
  contentType,
}: MovieCardProps) {
  const router = useRouter();
  const cardSize = CARD_SIZES[size];

  // Determine content type from prop, movie.content_type, or default to 'movie'
  const type = contentType || movie.content_type || 'movie';

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else {
      router.push(`/title/${movie.id}?type=${type}` as any);
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
            {'director' in movie && movie.director && ` • ${movie.director}`}
          </Text>
        </View>
      )}
    </Pressable>
  );
});

// Grid variant for displaying multiple movies/TV shows
interface MovieGridProps {
  movies: ContentItem[];
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
    gap: GAP,
  },
});
