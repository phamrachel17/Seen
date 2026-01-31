import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { IconSymbol } from '@/components/ui/icon-symbol';

const RESEND_COOLDOWN_MS = 60000; // 60 seconds

export default function VerifyEmailScreen() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [resending, setResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResendTime, setLastResendTime] = useState<number>(0);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

  // Cooldown timer
  useEffect(() => {
    if (lastResendTime === 0) return;

    const interval = setInterval(() => {
      const remaining = Math.max(0, RESEND_COOLDOWN_MS - (Date.now() - lastResendTime));
      setCooldownRemaining(remaining);
      if (remaining === 0) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [lastResendTime]);

  const handleResend = async () => {
    if (cooldownRemaining > 0 || resending) return;

    // Validate email is present and non-empty
    const trimmedEmail = typeof email === 'string' ? email.trim() : '';
    if (!trimmedEmail) {
      setError('No email address provided. Please go back and try again.');
      return;
    }

    setResending(true);
    setError(null);
    setResendSuccess(false);

    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: trimmedEmail,
        options: {
          emailRedirectTo: 'seen://auth/confirm',
        },
      });

      if (resendError) {
        setError(resendError.message);
      } else {
        setResendSuccess(true);
        setLastResendTime(Date.now());
      }
    } catch (e) {
      setError('Failed to resend email. Please try again.');
    }

    setResending(false);
  };

  const cooldownSeconds = Math.ceil(cooldownRemaining / 1000);

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <Pressable style={styles.backButton} onPress={() => router.back()}>
        <Text style={styles.backButtonText}>← Back</Text>
      </Pressable>

      <View style={styles.content}>
        <Text style={styles.title}>Seen</Text>

        <View style={styles.iconContainer}>
          <IconSymbol name="envelope" size={64} color={Colors.stamp} />
        </View>

        <Text style={styles.heading}>Verify your email</Text>
        <Text style={styles.description}>
          We sent a verification link to{'\n'}
          <Text style={styles.emailText}>{email}</Text>
        </Text>
        <Text style={styles.instruction}>
          Please check your inbox and spam folder, then click the link to verify your account.
        </Text>

        {error && <Text style={styles.errorText}>{error}</Text>}
        {resendSuccess && <Text style={styles.successText}>Verification email sent!</Text>}

        <Pressable
          style={({ pressed }) => [
            styles.resendButton,
            pressed && styles.buttonPressed,
            (cooldownRemaining > 0 || resending) && styles.buttonDisabled,
          ]}
          onPress={handleResend}
          disabled={cooldownRemaining > 0 || resending}
        >
          {resending ? (
            <ActivityIndicator color={Colors.stamp} />
          ) : cooldownRemaining > 0 ? (
            <Text style={styles.resendButtonText}>Resend in {cooldownSeconds}s</Text>
          ) : (
            <Text style={styles.resendButtonText}>Resend verification email</Text>
          )}
        </Pressable>

        <Pressable
          style={styles.signInLink}
          onPress={() => router.replace('/(auth)/sign-in')}
        >
          <Text style={styles.signInLinkText}>
            Already verified? <Text style={styles.signInLinkBold}>Sign in</Text>
          </Text>
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
  backButton: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
  },
  backButtonText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  title: {
    fontFamily: Fonts.serifBold,
    fontSize: FontSizes['4xl'],
    color: Colors.stamp,
    textAlign: 'center',
    marginBottom: Spacing['3xl'],
  },
  iconContainer: {
    marginBottom: Spacing.xl,
  },
  heading: {
    fontFamily: Fonts.serifSemiBold,
    fontSize: FontSizes['2xl'],
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  description: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.sm,
  },
  emailText: {
    fontFamily: Fonts.sansSemiBold,
    color: Colors.text,
  },
  instruction: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  errorText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.error,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  successText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.success,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  resendButton: {
    backgroundColor: Colors.stamp,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing['3xl'],
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  resendButtonText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.md,
    color: Colors.paper,
  },
  signInLink: {
    marginTop: Spacing['2xl'],
  },
  signInLinkText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  signInLinkBold: {
    fontFamily: Fonts.sansSemiBold,
    color: Colors.stamp,
  },
});
