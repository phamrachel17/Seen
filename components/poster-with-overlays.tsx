import { View, Text, StyleSheet, Pressable, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';

interface PosterWithOverlaysProps {
  posterUrl?: string;
  title: string;
  onPress?: () => void;
  // Progress overlay (for in-progress TV shows)
  progressSeason?: number;
  progressEpisode?: number;
  progressMinutes?: number;
  totalMinutes?: number;
  // Ranking overlay
  rankPosition?: number;
  // Size variants
  size?: 'small' | 'medium' | 'large';
  style?: ViewStyle;
}

const SIZE_CONFIG = {
  small: { width: 70, height: 105 },
  medium: { width: 100, height: 150 },
  large: { width: 140, height: 210 },
};

export function PosterWithOverlays({
  posterUrl,
  title,
  onPress,
  progressSeason,
  progressEpisode,
  progressMinutes,
  totalMinutes,
  rankPosition,
  size = 'medium',
  style,
}: PosterWithOverlaysProps) {
  const dimensions = SIZE_CONFIG[size];
  const hasProgress = progressSeason || progressMinutes;
  const hasRanking = rankPosition && rankPosition > 0;

  const renderProgressBadge = () => {
    if (progressSeason && progressEpisode) {
      // TV show progress
      return (
        <View style={styles.progressBadge}>
          <Text style={styles.progressBadgeText}>
            S{progressSeason} E{progressEpisode}
          </Text>
        </View>
      );
    }

    if (progressMinutes && totalMinutes) {
      // Movie progress (percentage)
      const percent = Math.round((progressMinutes / totalMinutes) * 100);
      return (
        <View style={styles.progressBadge}>
          <Text style={styles.progressBadgeText}>{percent}%</Text>
        </View>
      );
    }

    return null;
  };

  const renderRankingBadge = () => {
    if (!hasRanking) return null;

    return (
      <View style={styles.rankingBadge}>
        <Text style={styles.rankingBadgeText}>#{rankPosition}</Text>
      </View>
    );
  };

  const content = (
    <View style={[styles.container, { width: dimensions.width }, style]}>
      {posterUrl ? (
        <Image
          source={{ uri: posterUrl }}
          style={[styles.poster, dimensions]}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.posterPlaceholder, dimensions]}>
          <Text style={styles.posterPlaceholderText}>{title[0]}</Text>
        </View>
      )}

      {/* Progress badge (bottom-left) */}
      {hasProgress && (
        <View style={styles.progressBadgeContainer}>
          {renderProgressBadge()}
        </View>
      )}

      {/* Ranking badge (bottom-right) */}
      {hasRanking && (
        <View style={styles.rankingBadgeContainer}>
          {renderRankingBadge()}
        </View>
      )}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
        {content}
      </Pressable>
    );
  }

  return content;
}

// Grid variant for displaying multiple posters
interface PosterGridProps {
  items: Array<{
    id: number | string;
    posterUrl?: string;
    title: string;
    progressSeason?: number;
    progressEpisode?: number;
    progressMinutes?: number;
    totalMinutes?: number;
    rankPosition?: number;
  }>;
  onItemPress?: (id: number | string) => void;
  columns?: number;
  size?: 'small' | 'medium' | 'large';
}

export function PosterGrid({
  items,
  onItemPress,
  columns = 3,
  size = 'small',
}: PosterGridProps) {
  return (
    <View style={[styles.grid, { gap: Spacing.md }]}>
      {items.map((item) => (
        <PosterWithOverlays
          key={item.id}
          posterUrl={item.posterUrl}
          title={item.title}
          onPress={onItemPress ? () => onItemPress(item.id) : undefined}
          progressSeason={item.progressSeason}
          progressEpisode={item.progressEpisode}
          progressMinutes={item.progressMinutes}
          totalMinutes={item.totalMinutes}
          rankPosition={item.rankPosition}
          size={size}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  poster: {
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dust,
  },
  posterPlaceholder: {
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dust,
    alignItems: 'center',
    justifyContent: 'center',
  },
  posterPlaceholderText: {
    fontFamily: Fonts.serifBold,
    fontSize: FontSizes.xl,
    color: Colors.textMuted,
  },
  pressed: {
    opacity: 0.9,
  },
  progressBadgeContainer: {
    position: 'absolute',
    bottom: Spacing.xs,
    left: Spacing.xs,
  },
  progressBadge: {
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingVertical: 2,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  progressBadgeText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.xs,
    color: Colors.white,
  },
  rankingBadgeContainer: {
    position: 'absolute',
    bottom: Spacing.xs,
    right: Spacing.xs,
  },
  rankingBadge: {
    backgroundColor: Colors.stamp,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankingBadgeText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.xs,
    color: Colors.white,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});
