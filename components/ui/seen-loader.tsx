import { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Colors, Fonts, FontSizes } from '@/constants/theme';

interface SeenLoaderProps {
  size?: number;
}

export function SeenLoader({ size = 40 }: SeenLoaderProps) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    // Pulse animation: fade out -> fade in -> pause -> repeat
    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 600 }),
        withTiming(0.3, { duration: 600, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  // Scale font size based on size prop (base size 40 = FontSizes.xl)
  const scaledFontSize = (size / 40) * FontSizes.xl;

  return (
    <View style={styles.container}>
      <Animated.Text
        style={[
          styles.text,
          { fontSize: scaledFontSize },
          animatedStyle,
        ]}
      >
        Seen
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    fontFamily: Fonts.serifBold,
    color: Colors.stamp,
  },
});
