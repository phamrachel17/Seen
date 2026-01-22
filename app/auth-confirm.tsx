import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { IconSymbol } from '@/components/ui/icon-symbol';

type ConfirmStatus = 'loading' | 'success' | 'error';

export default function AuthConfirmScreen() {
  const { token_hash, type } = useLocalSearchParams<{ token_hash: string; type: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<ConfirmStatus>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (token_hash) {
      verifyEmail();
    } else {
      setStatus('error');
      setErrorMessage('Invalid confirmation link');
    }
  }, [token_hash]);

  const verifyEmail = async () => {
    try {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: token_hash as string,
        type: (type as 'signup' | 'email') || 'signup',
      });

      if (error) {
        setStatus('error');
        if (error.message.includes('expired')) {
          setErrorMessage('This confirmation link has expired. Please request a new one.');
        } else if (error.message.includes('already')) {
          setErrorMessage('This email has already been confirmed. You can sign in now.');
        } else {
          setErrorMessage(error.message);
        }
      } else {
        setStatus('success');
      }
    } catch (err) {
      setStatus('error');
      setErrorMessage('An unexpected error occurred. Please try again.');
    }
  };

  const handleGoToSignIn = () => {
    router.replace('/(auth)/sign-in');
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.content}>
        <Text style={styles.title}>Seen</Text>

        {status === 'loading' && (
          <>
            <ActivityIndicator size="large" color={Colors.stamp} style={styles.icon} />
            <Text style={styles.statusTitle}>Confirming your email...</Text>
            <Text style={styles.statusText}>Please wait while we verify your account.</Text>
          </>
        )}

        {status === 'success' && (
          <>
            <View style={styles.iconContainer}>
              <IconSymbol name="checkmark.circle.fill" size={64} color={Colors.success} />
            </View>
            <Text style={styles.statusTitle}>Email Confirmed!</Text>
            <Text style={styles.statusText}>
              Your account is ready. You can now sign in and start tracking your movies.
            </Text>
            <Pressable
              style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
              onPress={handleGoToSignIn}
            >
              <Text style={styles.buttonText}>Go to Sign In</Text>
            </Pressable>
          </>
        )}

        {status === 'error' && (
          <>
            <View style={styles.iconContainer}>
              <IconSymbol name="xmark.circle.fill" size={64} color={Colors.error} />
            </View>
            <Text style={styles.statusTitle}>Confirmation Failed</Text>
            <Text style={styles.statusText}>{errorMessage}</Text>
            <Pressable
              style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
              onPress={handleGoToSignIn}
            >
              <Text style={styles.buttonText}>Go to Sign In</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
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
  icon: {
    marginBottom: Spacing.xl,
  },
  iconContainer: {
    marginBottom: Spacing.xl,
  },
  statusTitle: {
    fontFamily: Fonts.serifSemiBold,
    fontSize: FontSizes['2xl'],
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  statusText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  button: {
    backgroundColor: Colors.handwriting,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing['3xl'],
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.sm,
    color: Colors.white,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
});
