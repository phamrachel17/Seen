import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { normalizeEmail } from '@/lib/validation';
import { IconSymbol } from '@/components/ui/icon-symbol';

const RESEND_COOLDOWN_MS = 60000;

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [lastSendTime, setLastSendTime] = useState<number>(0);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

  useEffect(() => {
    if (lastSendTime === 0) return;

    const interval = setInterval(() => {
      const remaining = Math.max(0, RESEND_COOLDOWN_MS - (Date.now() - lastSendTime));
      setCooldownRemaining(remaining);
      if (remaining === 0) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [lastSendTime]);

  const handleSendReset = async () => {
    if (cooldownRemaining > 0 || loading) return;

    const trimmed = email.trim();
    if (!trimmed) {
      setError('Please enter your email address');
      return;
    }

    if (!trimmed.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const normalized = normalizeEmail(trimmed);
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalized, {
        redirectTo: 'seen://auth/confirm',
      });

      if (resetError) {
        setError(resetError.message);
      } else {
        setSent(true);
        setLastSendTime(Date.now());
      }
    } catch (e) {
      setError('Something went wrong. Please try again.');
    }

    setLoading(false);
  };

  const cooldownSeconds = Math.ceil(cooldownRemaining / 1000);

  if (sent) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>← Back</Text>
        </Pressable>

        <View style={styles.centeredContent}>
          <Text style={styles.title}>Seen</Text>

          <View style={styles.iconContainer}>
            <IconSymbol name="envelope" size={64} color={Colors.stamp} />
          </View>

          <Text style={styles.heading}>Check your email</Text>
          <Text style={styles.description}>
            We sent a password reset link to{'\n'}
            <Text style={styles.emailText}>{email.trim()}</Text>
          </Text>
          <Text style={styles.instruction}>
            Click the link in the email to reset your password. Check your spam folder if you
            don&apos;t see it.
          </Text>

          {error && <Text style={styles.errorText}>{error}</Text>}

          <Pressable
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
              (cooldownRemaining > 0 || loading) && styles.buttonDisabled,
            ]}
            onPress={handleSendReset}
            disabled={cooldownRemaining > 0 || loading}
          >
            {loading ? (
              <ActivityIndicator color={Colors.paper} />
            ) : cooldownRemaining > 0 ? (
              <Text style={styles.buttonText}>Resend in {cooldownSeconds}s</Text>
            ) : (
              <Text style={styles.buttonText}>Resend reset email</Text>
            )}
          </Pressable>

          <Pressable onPress={() => router.replace('/(auth)/sign-in')}>
            <Text style={styles.linkText}>
              Back to <Text style={styles.linkTextBold}>Sign in</Text>
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Pressable style={styles.backButton} onPress={() => router.back()}>
        <Text style={styles.backButtonText}>← Back</Text>
      </Pressable>

      <View style={styles.content}>
        <Text style={styles.title}>Seen</Text>
        <Text style={styles.subtitle}>Reset your password</Text>

        <View style={styles.form}>
          <View style={styles.inputContainer}>
            <Text style={styles.label}>EMAIL</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="your@email.com"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
            />
          </View>

          {error && <Text style={styles.errorText}>{error}</Text>}

          <Pressable
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
              loading && styles.buttonDisabled,
            ]}
            onPress={handleSendReset}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={Colors.paper} />
            ) : (
              <Text style={styles.buttonText}>Send Reset Link</Text>
            )}
          </Pressable>
        </View>

        <Pressable onPress={() => router.replace('/(auth)/sign-in')}>
          <Text style={styles.linkText}>
            Remember your password? <Text style={styles.linkTextBold}>Sign in</Text>
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
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
    paddingHorizontal: Spacing.xl,
    justifyContent: 'center',
  },
  centeredContent: {
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
  },
  subtitle: {
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.xl,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing['2xl'],
  },
  iconContainer: {
    marginTop: Spacing['3xl'],
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
  form: {
    gap: Spacing.lg,
  },
  inputContainer: {
    gap: Spacing.xs,
  },
  label: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    letterSpacing: 1.5,
  },
  input: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.lg,
    color: Colors.text,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingVertical: Spacing.md,
  },
  errorText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.error,
    textAlign: 'center',
  },
  button: {
    backgroundColor: Colors.stamp,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.md,
    color: Colors.paper,
  },
  linkText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Spacing['2xl'],
  },
  linkTextBold: {
    fontFamily: Fonts.sansSemiBold,
    color: Colors.stamp,
  },
});
