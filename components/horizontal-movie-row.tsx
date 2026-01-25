import { View, Text, StyleSheet, ScrollView, Pressable, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';
import { Movie, TVShow, ContentType } from '@/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const POSTER_WIDTH = 100;
const POSTER_HEIGHT = 150;

type ContentItem = (Movie | TVShow) & { content_type?: ContentType };

interface HorizontalMovieRowProps {
  title: string;
  subtitle?: string;
  movies: ContentItem[];
  onSeeAll?: () => void;
  isLoading?: boolean;
  type?: ContentType;
}

export function HorizontalMovieRow({
  title,
  subtitle,
  movies,
  onSeeAll,
  isLoading = false,
  type: propType,
}: HorizontalMovieRowProps) {
  const router = useRouter();

  const handleMoviePress = (movie: ContentItem) => {
    // Use prop type if provided, otherwise fall back to item's content_type, then 'movie'
    const type = propType || movie.content_type || 'movie';
    router.push(`/title/${movie.id}?type=${type}` as any);
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>
        <View style={styles.loadingContainer}>
          {[1, 2, 3].map((i) => (
            <View key={i} style={styles.loadingPoster} />
          ))}
        </View>
      </View>
    );
  }

  if (movies.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleContainer}>
          <Text style={styles.title}>{title}</Text>
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>
        {onSeeAll && (
          <Pressable onPress={onSeeAll} style={styles.seeAllButton}>
            <Text style={styles.seeAllText}>See all</Text>
          </Pressable>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {movies.map((movie) => (
          <Pressable
            key={movie.id}
            style={({ pressed }) => [
              styles.movieItem,
              pressed && styles.pressed,
            ]}
            onPress={() => handleMoviePress(movie)}
          >
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
            <Text style={styles.movieTitle} numberOfLines={2}>
              {movie.title}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.md,
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    fontFamily: Fonts.serifBold,
    fontSize: FontSizes.xl,
    color: Colors.stamp,
  },
  subtitle: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    letterSpacing: 1,
    marginTop: 2,
  },
  seeAllButton: {
    padding: Spacing.xs,
  },
  seeAllText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.stamp,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  movieItem: {
    width: POSTER_WIDTH,
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  poster: {
    width: POSTER_WIDTH,
    height: POSTER_HEIGHT,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dust,
  },
  posterPlaceholder: {
    width: POSTER_WIDTH,
    height: POSTER_HEIGHT,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dust,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontFamily: Fonts.serifBold,
    fontSize: FontSizes['2xl'],
    color: Colors.textMuted,
  },
  movieTitle: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.xs,
    color: Colors.text,
    marginTop: Spacing.xs,
    lineHeight: FontSizes.xs * 1.3,
  },
  loadingContainer: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  loadingPoster: {
    width: POSTER_WIDTH,
    height: POSTER_HEIGHT,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dust,
  },
});
