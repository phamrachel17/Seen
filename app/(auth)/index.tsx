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
    fontSize: 96,
    color: Colors.stamp,
    letterSpacing: -2,
  },
  tagline: {
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes['3xl'],
    color: Colors.stamp,
    marginTop: Spacing.md,
  },
  illustrationContainer: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
  },
  illustration: {
    width: '100%',
    height: '100%',
    maxHeight: 320,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.xl,
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  button: {
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing['3xl'],
    borderRadius: BorderRadius.md,
    minWidth: 140,
    alignItems: 'center',
  },
  buttonOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.handwriting,
  },
  buttonOutlineText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.lg,
    color: Colors.handwriting,
  },
  buttonPressed: {
    opacity: 0.7,
  },
});
