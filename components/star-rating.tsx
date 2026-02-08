import { View, StyleSheet, Pressable, GestureResponderEvent, LayoutChangeEvent } from 'react-native';
import { useState, useRef } from 'react';
import { Colors, Spacing } from '@/constants/theme';
import { IconSymbol, IconSymbolName } from '@/components/ui/icon-symbol';

interface StarRatingProps {
  rating: number;
  onRatingChange?: (rating: number) => void;
  size?: number;
  readonly?: boolean;
  allowHalfStars?: boolean;
}

/**
 * Interactive star rating component with optional half-star support.
 * - When allowHalfStars is true (default), tapping the left half of a star
 *   gives a half-star rating (e.g., tapping left of star 4 = 3.5★)
 * - Tapping the right half gives a full star rating (e.g., tapping right of star 4 = 4★)
 * - Tapping the same rating toggles it off (sets to 0)
 */
export function StarRating({
  rating,
  onRatingChange,
  size = 32,
  readonly = false,
  allowHalfStars = true,
}: StarRatingProps) {
  const [starWidths, setStarWidths] = useState<number[]>([0, 0, 0, 0, 0]);
  const containerRef = useRef<View>(null);

  const handlePress = (star: number, event: GestureResponderEvent) => {
    if (readonly || !onRatingChange) return;

    if (allowHalfStars) {
      // Get press position relative to the star
      const { locationX } = event.nativeEvent;
      const starWidth = starWidths[star - 1] || size;
      const isLeftHalf = locationX < starWidth / 2;

      // Left half = half star (e.g., 3.5), right half = full star (e.g., 4)
      const newRating = isLeftHalf ? star - 0.5 : star;

      // Toggle off if tapping same rating
      onRatingChange(newRating === rating ? 0 : newRating);
    } else {
      // Original whole-star behavior
      onRatingChange(star === rating ? 0 : star);
    }
  };

  const handleStarLayout = (index: number, event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    setStarWidths((prev) => {
      const next = [...prev];
      next[index] = width;
      return next;
    });
  };

  const getStarIcon = (star: number): IconSymbolName => {
    if (rating >= star) return 'star.fill';
    if (rating >= star - 0.5) return 'star.leadinghalf.filled';
    return 'star';
  };

  const getStarColor = (star: number): string => {
    if (rating >= star - 0.5) return Colors.starFilled;
    return Colors.starEmpty;
  };

  return (
    <View ref={containerRef} style={styles.container}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Pressable
          key={star}
          onPress={(e) => handlePress(star, e)}
          onLayout={(e) => handleStarLayout(star - 1, e)}
          disabled={readonly}
          style={({ pressed }) => [
            styles.star,
            pressed && !readonly && styles.starPressed,
          ]}
          hitSlop={8}
        >
          <IconSymbol
            name={getStarIcon(star)}
            size={size}
            color={getStarColor(star)}
          />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  star: {
    padding: 2,
  },
  starPressed: {
    transform: [{ scale: 1.1 }],
  },
});
