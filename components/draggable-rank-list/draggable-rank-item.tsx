import { useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  useAnimatedStyle,
  useAnimatedReaction,
  withSpring,
  withTiming,
  runOnJS,
  SharedValue,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Movie, Ranking } from '@/types';

export interface RankedMovie extends Movie {
  ranking: Ranking;
  star_rating: number;
}

interface DraggableRankItemProps {
  movie: RankedMovie;
  index: number;
  itemHeight: number;
  itemCount: number;
  isEditMode: boolean;
  dragY: SharedValue<number>;
  draggedIndex: SharedValue<number>;
  onDragEnd: (fromIndex: number, toIndex: number) => void;
  onPress: () => void;
}

function ScoreBadge({ score }: { score: number }) {
  const getScoreColor = () => {
    if (score >= 8.0) return Colors.stamp;
    if (score >= 6.0) return Colors.settledTea;
    return Colors.textMuted;
  };

  return (
    <View style={[styles.scoreBadge, { borderColor: getScoreColor() }]}>
      <Text style={[styles.scoreText, { color: getScoreColor() }]}>
        {score.toFixed(1)}
      </Text>
    </View>
  );
}

export function DraggableRankItem({
  movie,
  index,
  itemHeight,
  itemCount,
  isEditMode,
  dragY,
  draggedIndex,
  onDragEnd,
  onPress,
}: DraggableRankItemProps) {
  const triggerHaptic = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  const triggerSelectionHaptic = useCallback(() => {
    Haptics.selectionAsync();
  }, []);

  const triggerSuccessHaptic = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  // Haptic feedback when crossing position thresholds during drag
  useAnimatedReaction(
    () => {
      if (draggedIndex.value !== index) return null;
      return Math.round(dragY.value / itemHeight);
    },
    (current, previous) => {
      if (current !== null && previous !== null && current !== previous) {
        runOnJS(triggerSelectionHaptic)();
      }
    }
  );

  const gesture = Gesture.Pan()
    .activateAfterLongPress(200)
    .enabled(isEditMode)
    .onStart(() => {
      draggedIndex.value = index;
      runOnJS(triggerHaptic)();
    })
    .onUpdate((e) => {
      dragY.value = e.translationY;
    })
    .onEnd(() => {
      const newIndex = index + Math.round(dragY.value / itemHeight);
      const clampedIndex = Math.max(0, Math.min(newIndex, itemCount - 1));

      runOnJS(triggerSuccessHaptic)();
      runOnJS(onDragEnd)(index, clampedIndex);

      // Reset shared values
      dragY.value = withSpring(0);
      draggedIndex.value = -1;
    });

  const animatedStyle = useAnimatedStyle(() => {
    const isBeingDragged = draggedIndex.value === index;

    if (isBeingDragged) {
      // This item is being dragged - follow the finger
      return {
        transform: [
          { translateY: dragY.value },
          { scale: withSpring(1.02) },
        ],
        zIndex: 100,
        shadowOpacity: withTiming(0.2),
        backgroundColor: Colors.cardBackground,
      };
    }

    // Calculate if this item needs to shift to make room
    if (draggedIndex.value === -1) {
      // No drag in progress
      return {
        transform: [
          { translateY: withSpring(0) },
          { scale: 1 },
        ],
        zIndex: 0,
        shadowOpacity: 0,
        backgroundColor: 'transparent',
      };
    }

    // Calculate the current position of the dragged item
    const draggedPos = draggedIndex.value + Math.round(dragY.value / itemHeight);
    let offset = 0;

    if (draggedIndex.value < index && draggedPos >= index) {
      // Dragged item came from above and is now at or past this position
      offset = -itemHeight;
    } else if (draggedIndex.value > index && draggedPos <= index) {
      // Dragged item came from below and is now at or past this position
      offset = itemHeight;
    }

    return {
      transform: [
        { translateY: withSpring(offset, { damping: 20, stiffness: 200 }) },
        { scale: 1 },
      ],
      zIndex: 0,
      shadowOpacity: 0,
      backgroundColor: 'transparent',
    };
  });

  const handlePress = useCallback(() => {
    if (!isEditMode) {
      onPress();
    }
  }, [isEditMode, onPress]);

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.itemWrapper, animatedStyle]}>
        <Pressable
          style={({ pressed }) => [
            styles.rankItem,
            pressed && !isEditMode && styles.itemPressed,
          ]}
          onPress={handlePress}
          disabled={isEditMode}
        >
          {/* Rank Number */}
          <View style={styles.rankNumberContainer}>
            <Text style={[styles.rankNumber, index < 3 && styles.topRankNumber]}>
              {index + 1}
            </Text>
          </View>

          {/* Poster */}
          {movie.poster_url ? (
            <Image
              source={{ uri: movie.poster_url }}
              style={styles.poster}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.poster, styles.posterPlaceholder]}>
              <Text style={styles.placeholderLetter}>{movie.title[0]}</Text>
            </View>
          )}

          {/* Movie Info */}
          <View style={styles.movieInfo}>
            <Text style={styles.movieTitle} numberOfLines={2}>
              {movie.title}
            </Text>
            <Text style={styles.movieMeta}>
              {movie.release_year}
              {movie.director ? ` • ${movie.director}` : ''}
            </Text>
          </View>

          {/* Display Score */}
          <View style={styles.scoreContainer}>
            <ScoreBadge score={movie.ranking.display_score} />
          </View>

          {/* Edit mode: drag handle, otherwise chevron */}
          {isEditMode ? (
            <IconSymbol
              name="line.3.horizontal"
              size={20}
              color={Colors.textMuted}
            />
          ) : (
            <IconSymbol
              name="chevron.right"
              size={16}
              color={Colors.textMuted}
            />
          )}
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  itemWrapper: {
    shadowColor: Colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 5,
  },
  rankItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.background,
  },
  itemPressed: {
    backgroundColor: Colors.dust,
  },
  rankNumberContainer: {
    width: 32,
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  rankNumber: {
    fontFamily: Fonts.serifBold,
    fontSize: FontSizes.lg,
    color: Colors.textMuted,
  },
  topRankNumber: {
    color: Colors.stamp,
    fontSize: FontSizes.xl,
  },
  poster: {
    width: 50,
    height: 75,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dust,
  },
  posterPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderLetter: {
    fontFamily: Fonts.serifBold,
    fontSize: FontSizes.lg,
    color: Colors.textMuted,
  },
  movieInfo: {
    flex: 1,
    marginLeft: Spacing.md,
    marginRight: Spacing.sm,
  },
  movieTitle: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.md,
    color: Colors.text,
    marginBottom: 2,
  },
  movieMeta: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
  },
  scoreContainer: {
    marginRight: Spacing.sm,
  },
  scoreBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    minWidth: 40,
    alignItems: 'center',
  },
  scoreText: {
    fontFamily: Fonts.serifBold,
    fontSize: FontSizes.sm,
  },
});
