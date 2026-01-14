import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';

export default function LandingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Seen</Text>
        <Text style={styles.tagline}>What&apos;s your take on it?</Text>
      </View>

      {/* Illustration */}
      <View style={styles.illustrationContainer}>
        <Image
          source={require('@/assets/images/manAndTv.jpg')}
          style={styles.illustration}
          contentFit="contain"
        />
      </View>

      {/* Buttons */}
      <View style={[styles.buttonContainer, { paddingBottom: insets.bottom + Spacing.xl }]}>
        <Pressable
          style={({ pressed }) => [
            styles.button,
            styles.buttonOutline,
            pressed && styles.buttonPressed,
          ]}
          onPress={() => router.push('/(auth)/sign-up')}
        >
          <Text style={styles.buttonOutlineText}>Sign Up</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.button,
            styles.buttonOutline,
            pressed && styles.buttonPressed,
          ]}
          onPress={() => router.push('/(auth)/sign-in')}
        >
          <Text style={styles.buttonOutlineText}>Log In</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    alignItems: 'center',
    paddingTop: Spacing['3xl'],
    paddingHorizontal: Spacing.xl,
  },
  title: {
    fontFamily: Fonts.serifBold,
    fontSize: 72,
    color: Colors.stamp,
    letterSpacing: -2,
  },
  tagline: {
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes['2xl'],
    color: Colors.stamp,
    marginTop: Spacing.sm,
  },
  illustrationContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  illustration: {
    width: '100%',
    height: '100%',
    maxHeight: 400,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.lg,
    paddingHorizontal: Spacing.xl,
  },
  button: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing['2xl'],
    borderRadius: BorderRadius.sm,
    minWidth: 120,
    alignItems: 'center',
  },
  buttonOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.handwriting,
  },
  buttonOutlineText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.handwriting,
  },
  buttonPressed: {
    opacity: 0.7,
  },
});
