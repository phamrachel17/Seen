import { View, StyleSheet } from 'react-native';
import { IconSymbol, IconSymbolName } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';

interface StarDisplayProps {
  rating: number;
  size?: number;
  gap?: number;
}

/**
 * Read-only star display component with half-star support.
 * Displays 5 stars with filled, half-filled, or empty states based on the rating.
 */
export function StarDisplay({ rating, size = 12, gap = 2 }: StarDisplayProps) {
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
    <View style={[styles.container, { gap }]}>
      {[1, 2, 3, 4, 5].map((star) => (
        <IconSymbol
          key={star}
          name={getStarIcon(star)}
          size={size}
          color={getStarColor(star)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
  },
});
