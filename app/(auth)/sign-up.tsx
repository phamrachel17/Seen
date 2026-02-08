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
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { checkUsernameAvailable, getEmailStatus } from '@/lib/validation';

const RESEND_COOLDOWN_MS = 60000; // 60 seconds

export default function SignUpScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signUp } = useAuth();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [lastResendTime, setLastResendTime] = useState<number>(0);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

  // Cooldown timer for resend button
  useEffect(() => {
    if (lastResendTime === 0) return;

    const interval = setInterval(() => {
      const remaining = Math.max(0, RESEND_COOLDOWN_MS - (Date.now() - lastResendTime));
      setCooldownRemaining(remaining);
      if (remaining === 0) clearInterval(interval);
    }, 1000);

    return () => clearInterval(interval);
  }, [lastResendTime]);

  const handleSignUp = async () => {
    // Clear all errors
    setUsernameError(null);
    setEmailError(null);
    setPasswordError(null);
    setGeneralError(null);

    // Trim inputs
    const trimmedUsername = username.trim();
    const trimmedDisplayName = displayName.trim();
    const trimmedEmail = email.trim();

    // Basic validation
    if (!trimmedUsername || !trimmedDisplayName || !trimmedEmail || !password || !confirmPassword) {
      setGeneralError('Please fill in all fields');
      return;
    }

    // Username character validation (alphanumeric and underscore only)
    if (!/^[a-zA-Z0-9_]+$/.test(trimmedUsername)) {
      setUsernameError('Username can only contain letters, numbers, and underscores');
      return;
    }

    // Username length validation
    if (trimmedUsername.length < 3) {
      setUsernameError('Username must be at least 3 characters');
      return;
    }

    if (trimmedUsername.length > 30) {
      setUsernameError('Username must be 30 characters or less');
      return;
    }

    if (password !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    // Pre-flight duplicate checking (in parallel)
    const [isUsernameAvailable, emailStatus] = await Promise.all([
      checkUsernameAvailable(trimmedUsername),
      getEmailStatus(trimmedEmail),
    ]);

    let hasErrors = false;

    if (!isUsernameAvailable) {
      setUsernameError('This username is already taken');
      hasErrors = true;
    }

    if (emailStatus.exists) {
      if (emailStatus.verified) {
        // Email exists AND is verified - truly taken
        setEmailError('An account with this email already exists');
        hasErrors = true;
      } else {
        // Email exists but NOT verified - resend verification email
        try {
          await supabase.auth.resend({
            type: 'signup',
            email: trimmedEmail,
            options: {
              emailRedirectTo: 'seen://auth/confirm',
            },
          });
          setResendSuccess(true);
          setLastResendTime(Date.now());
          setSuccess(true);
        } catch (e) {
          setGeneralError('Failed to resend verification email. Please try again.');
        }
        setLoading(false);
        return;
      }
    }

    if (hasErrors) {
      setLoading(false);
      return; // Preserve input, don't clear fields
    }

    // Call signUp (email normalization happens in signUp function)
    const { error: signUpError } = await signUp(trimmedEmail, password, trimmedUsername, trimmedDisplayName);

    setLoading(false);

    if (signUpError) {
      setGeneralError(signUpError.message);
    } else {
      setSuccess(true);
    }
  };

  const handleResendEmail = async () => {
    if (cooldownRemaining > 0) return;

    setResending(true);
    setResendSuccess(false);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
        options: {
          emailRedirectTo: 'seen://auth/confirm',
        },
      });
      if (!error) {
        setResendSuccess(true);
        setLastResendTime(Date.now());
      }
    } finally {
      setResending(false);
    }
  };

  const cooldownSeconds = Math.ceil(cooldownRemaining / 1000);

  if (success) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.successContainer}>
          <Text style={styles.title}>Seen</Text>
          <Text style={styles.successTitle}>Check your email</Text>
          <Text style={styles.successText}>
            {resendSuccess
              ? `We resent a confirmation link to ${email}. Please verify your email, then sign in.`
              : `We sent a confirmation link to ${email}. Please verify your email, then sign in.`}
          </Text>
          <Pressable
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            onPress={() => router.replace('/(auth)/sign-in')}
          >
            <Text style={styles.buttonText}>Go to Sign In</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.resendButton,
              pressed && styles.buttonPressed,
              (resending || cooldownRemaining > 0) && styles.buttonDisabled,
            ]}
            onPress={handleResendEmail}
            disabled={resending || cooldownRemaining > 0}
          >
            {resending ? (
              <ActivityIndicator size="small" color={Colors.textMuted} />
            ) : cooldownRemaining > 0 ? (
              <Text style={styles.resendButtonText}>Resend in {cooldownSeconds}s</Text>
            ) : (
              <Text style={styles.resendButtonText}>
                {resendSuccess ? 'Email sent!' : "Didn't receive it? Resend"}
              </Text>
            )}
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
      {/* Back button */}
      <Pressable style={styles.backButton} onPress={() => router.back()}>
        <Text style={styles.backButtonText}>← Back</Text>
      </Pressable>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.content}>
          <Text style={styles.title}>Seen</Text>
          <Text style={styles.subtitle}>Create your account</Text>

          <View style={styles.form}>
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Username</Text>
              <TextInput
                style={[styles.input, usernameError && styles.inputError]}
                value={username}
                onChangeText={(text) => {
                  setUsername(text);
                  setUsernameError(null); // Clear error on change
                }}
                placeholder="filmcritic42"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {usernameError && <Text style={styles.fieldErrorText}>{usernameError}</Text>}
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Your Name</Text>
              <TextInput
                style={styles.input}
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Film Critic"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="words"
                autoCorrect={false}
                maxLength={50}
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={[styles.input, emailError && styles.inputError]}
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  setEmailError(null); // Clear error on change
                }}
                placeholder="your@email.com"
                placeholderTextColor={Colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {emailError && <Text style={styles.fieldErrorText}>{emailError}</Text>}
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.passwordContainer}>
                <TextInput
                  style={styles.passwordInput}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor={Colors.textMuted}
                  secureTextEntry={!showPassword}
                />
                <Pressable
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeButton}
                >
                  <IconSymbol
                    name={showPassword ? 'eye.slash' : 'eye'}
                    size={20}
                    color={Colors.textMuted}
                  />
                </Pressable>
              </View>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Confirm Password</Text>
              <View style={styles.passwordContainer}>
                <TextInput
                  style={styles.passwordInput}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="••••••••"
                  placeholderTextColor={Colors.textMuted}
                  secureTextEntry={!showConfirmPassword}
                />
                <Pressable
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                  style={styles.eyeButton}
                >
                  <IconSymbol
                    name={showConfirmPassword ? 'eye.slash' : 'eye'}
                    size={20}
                    color={Colors.textMuted}
                  />
                </Pressable>
              </View>
              {passwordError && <Text style={styles.fieldErrorText}>{passwordError}</Text>}
            </View>

            {generalError && <Text style={styles.errorText}>{generalError}</Text>}

            <Pressable
              style={({ pressed }) => [
                styles.button,
                pressed && styles.buttonPressed,
                loading && styles.buttonDisabled,
              ]}
              onPress={handleSignUp}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.buttonText}>Sign Up</Text>
              )}
            </Pressable>
          </View>

          <Pressable onPress={() => router.replace('/(auth)/sign-in')}>
            <Text style={styles.switchText}>
              Already have an account? <Text style={styles.switchTextBold}>Log in</Text>
            </Text>
          </Pressable>
        </View>
      </ScrollView>
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
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    justifyContent: 'center',
    paddingBottom: Spacing['3xl'],
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
    textTransform: 'uppercase',
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
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  passwordInput: {
    flex: 1,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.lg,
    color: Colors.text,
    paddingVertical: Spacing.md,
  },
  eyeButton: {
    padding: Spacing.sm,
  },
  inputError: {
    borderBottomColor: Colors.error,
    borderBottomWidth: 2,
  },
  fieldErrorText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.error,
    marginTop: Spacing.xs,
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
  switchText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Spacing['2xl'],
  },
  switchTextBold: {
    fontFamily: Fonts.sansSemiBold,
    color: Colors.stamp,
  },
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  successTitle: {
    fontFamily: Fonts.serifSemiBold,
    fontSize: FontSizes['2xl'],
    color: Colors.text,
    marginTop: Spacing.xl,
    marginBottom: Spacing.md,
  },
  successText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: Spacing.xl,
    lineHeight: 22,
  },
  resendButton: {
    marginTop: Spacing.md,
    paddingVertical: Spacing.md,
  },
  resendButtonText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
    textAlign: 'center',
  },
});
