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
import { Colors } from '@/constants/theme';

interface EyeLoaderProps {
  size?: number;
}

export function EyeLoader({ size = 40 }: EyeLoaderProps) {
  const eyeOpenness = useSharedValue(1); // 1 = open, 0 = closed

  useEffect(() => {
    // Blink animation: open -> close quickly -> open -> pause -> repeat
    eyeOpenness.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2000 }), // Stay open
        withTiming(0, { duration: 100, easing: Easing.inOut(Easing.ease) }), // Close
        withTiming(1, { duration: 100, easing: Easing.inOut(Easing.ease) }), // Open
      ),
      -1, // Infinite repeat
      false
    );
  }, []);

  // Eye dimensions
  const eyeWidth = size;
  const eyeHeight = size * 0.5;
  const irisSize = eyeHeight * 0.8;
  const pupilSize = irisSize * 0.5;

  const upperLidStyle = useAnimatedStyle(() => ({
    height: (eyeHeight / 2) * (1 - eyeOpenness.value),
  }));

  const lowerLidStyle = useAnimatedStyle(() => ({
    height: (eyeHeight / 2) * (1 - eyeOpenness.value),
  }));

  return (
    <View style={[styles.eyeContainer, { width: eyeWidth, height: eyeHeight }]}>
      {/* Eye shape */}
      <View
        style={[
          styles.eyeShape,
          { width: eyeWidth, height: eyeHeight, borderRadius: eyeHeight / 2 },
        ]}
      >
        {/* Iris */}
        <View
          style={[
            styles.iris,
            { width: irisSize, height: irisSize, borderRadius: irisSize / 2 },
          ]}
        >
          {/* Pupil */}
          <View
            style={[
              styles.pupil,
              { width: pupilSize, height: pupilSize, borderRadius: pupilSize / 2 },
            ]}
          />
          {/* Highlight */}
          <View
            style={[
              styles.highlight,
              {
                width: pupilSize * 0.35,
                height: pupilSize * 0.35,
                borderRadius: pupilSize * 0.175,
                top: pupilSize * 0.15,
                left: pupilSize * 0.5,
              },
            ]}
          />
        </View>
      </View>

      {/* Upper eyelid */}
      <Animated.View
        style={[
          styles.eyelid,
          styles.upperLid,
          { width: eyeWidth + 4, borderRadius: eyeHeight / 2 },
          upperLidStyle,
        ]}
      />

      {/* Lower eyelid */}
      <Animated.View
        style={[
          styles.eyelid,
          styles.lowerLid,
          { width: eyeWidth + 4, borderRadius: eyeHeight / 2 },
          lowerLidStyle,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  eyeContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  eyeShape: {
    backgroundColor: Colors.paper,
    borderWidth: 1.5,
    borderColor: Colors.text,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iris: {
    backgroundColor: Colors.stamp,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pupil: {
    backgroundColor: Colors.text,
  },
  highlight: {
    position: 'absolute',
    backgroundColor: Colors.white,
  },
  eyelid: {
    position: 'absolute',
    backgroundColor: Colors.background,
  },
  upperLid: {
    top: 0,
  },
  lowerLid: {
    bottom: 0,
  },
});
