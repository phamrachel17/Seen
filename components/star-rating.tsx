import { View, StyleSheet, Pressable } from 'react-native';
import { Colors, Spacing } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';

interface StarRatingProps {
  rating: number;
  onRatingChange?: (rating: number) => void;
  size?: number;
  readonly?: boolean;
}

export function StarRating({
  rating,
  onRatingChange,
  size = 32,
  readonly = false,
}: StarRatingProps) {
  const handlePress = (star: number) => {
    if (!readonly && onRatingChange) {
      // If tapping the same star, allow deselecting (set to 0)
      onRatingChange(star === rating ? 0 : star);
    }
  };

  return (
    <View style={styles.container}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Pressable
          key={star}
          onPress={() => handlePress(star)}
          disabled={readonly}
          style={({ pressed }) => [
            styles.star,
            pressed && !readonly && styles.starPressed,
          ]}
          hitSlop={8}
        >
          <IconSymbol
            name={star <= rating ? 'star.fill' : 'star'}
            size={size}
            color={star <= rating ? Colors.starFilled : Colors.starEmpty}
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
