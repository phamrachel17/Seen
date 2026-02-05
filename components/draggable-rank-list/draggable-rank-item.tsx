import { useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  useAnimatedStyle,
  useAnimatedReaction,
  useSharedValue,
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

const DELETE_BUTTON_WIDTH = 80;

export interface RankedMovie extends Movie {
  ranking: Ranking;
  star_rating: number | null;  // null indicates missing data (not 0 stars)
}

interface DraggableRankItemProps {
  movie: RankedMovie;
  index: number;
  itemHeight: number;
  itemCount: number;
  isEditMode: boolean;
  dragY: SharedValue<number>;
  draggedIndex: SharedValue<number>;
  swipedOpenIndex: SharedValue<number>;
  onDragEnd: (fromIndex: number, toIndex: number) => void;
  onPress: () => void;
  onDelete?: (tmdbId: number) => void;
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
  swipedOpenIndex,
  onDragEnd,
  onPress,
  onDelete,
}: DraggableRankItemProps) {
  // Swipe translation for delete reveal
  const translateX = useSharedValue(0);

  const triggerHaptic = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  const triggerSelectionHaptic = useCallback(() => {
    Haptics.selectionAsync();
  }, []);

  const triggerSuccessHaptic = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  // Close swipe when another item is swiped open or when exiting edit mode
  useAnimatedReaction(
    () => swipedOpenIndex.value,
    (currentSwipedIndex) => {
      if (currentSwipedIndex !== index && translateX.value !== 0) {
        translateX.value = withSpring(0);
      }
    }
  );

  // Reset swipe when exiting edit mode
  useEffect(() => {
    if (!isEditMode) {
      translateX.value = withSpring(0);
    }
  }, [isEditMode, translateX]);

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

  // Horizontal swipe gesture for delete reveal
  const swipeGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-10, 10])
    .enabled(isEditMode)
    .onStart(() => {
      // Close any other open swipe
      if (swipedOpenIndex.value !== index && swipedOpenIndex.value !== -1) {
        swipedOpenIndex.value = -1;
      }
    })
    .onUpdate((e) => {
      // Only allow left swipe (negative X)
      if (e.translationX < 0) {
        translateX.value = Math.max(e.translationX, -DELETE_BUTTON_WIDTH);
      } else if (translateX.value < 0) {
        // Allow swiping back to close
        translateX.value = Math.min(0, translateX.value + e.translationX);
      }
    })
    .onEnd(() => {
      const threshold = -DELETE_BUTTON_WIDTH / 2;
      if (translateX.value < threshold) {
        translateX.value = withSpring(-DELETE_BUTTON_WIDTH);
        swipedOpenIndex.value = index;
        runOnJS(triggerSelectionHaptic)();
      } else {
        translateX.value = withSpring(0);
        if (swipedOpenIndex.value === index) {
          swipedOpenIndex.value = -1;
        }
      }
    });

  // Vertical drag gesture for reordering (requires long press)
  const dragGesture = Gesture.Pan()
    .activateAfterLongPress(200)
    .enabled(isEditMode)
    .onStart(() => {
      // Close any open swipe first
      if (translateX.value !== 0) {
        translateX.value = withSpring(0);
        swipedOpenIndex.value = -1;
      }
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

  // Combine gestures: swipe is primary, drag requires long press
  const combinedGesture = Gesture.Race(swipeGesture, dragGesture);

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

  // Animated style for swipe translation
  const swipeAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const handlePress = useCallback(() => {
    if (!isEditMode) {
      onPress();
    }
  }, [isEditMode, onPress]);

  const handleDelete = useCallback(() => {
    if (onDelete) {
      onDelete(movie.id);
    }
  }, [onDelete, movie.id]);

  return (
    <GestureDetector gesture={combinedGesture}>
      <Animated.View style={[styles.itemWrapper, animatedStyle]}>
        {/* Delete button behind the row */}
        {isEditMode && (
          <Pressable style={styles.deleteButtonContainer} onPress={handleDelete}>
            <IconSymbol name="trash" size={24} color={Colors.white} />
          </Pressable>
        )}

        {/* Main content with swipe animation */}
        <Animated.View style={[styles.swipeableContent, swipeAnimatedStyle]}>
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
    position: 'relative',
  },
  swipeableContent: {
    backgroundColor: Colors.background,
  },
  deleteButtonContainer: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: DELETE_BUTTON_WIDTH,
    backgroundColor: Colors.error,
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.error,
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
