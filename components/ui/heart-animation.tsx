import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { IconSymbol } from './icon-symbol';
import { Colors } from '@/constants/theme';

interface HeartAnimationProps {
  visible: boolean;
  onComplete: () => void;
}

export function HeartAnimation({ visible, onComplete }: HeartAnimationProps) {
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      // Reset values
      scale.value = 0;
      opacity.value = 1;

      // Animate: pop in with spring, hold, then fade out
      scale.value = withSequence(
        withSpring(1.2, { damping: 8, stiffness: 200 }),
        withTiming(1, { duration: 100 }),
        withTiming(1, { duration: 300 }), // hold
        withTiming(0.8, { duration: 150 })
      );

      opacity.value = withSequence(
        withTiming(1, { duration: 100 }),
        withTiming(1, { duration: 400 }), // hold visible
        withTiming(0, { duration: 150 }, () => {
          runOnJS(onComplete)();
        })
      );
    }
  }, [visible, scale, opacity, onComplete]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  if (!visible) return null;

  return (
    <Animated.View style={[styles.container, animatedStyle]} pointerEvents="none">
      <IconSymbol name="heart.fill" size={80} color={Colors.stamp} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
});
