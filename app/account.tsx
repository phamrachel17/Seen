import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

type ActiveSection = 'menu' | 'email' | 'password';

export default function AccountScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, deleteAccount } = useAuth();
  const [activeSection, setActiveSection] = useState<ActiveSection>('menu');
  const [isDeleting, setIsDeleting] = useState(false);

  // Email change state
  const [newEmail, setNewEmail] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  // Password change state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to permanently delete your account?\n\nAll your reviews, rankings, watchlist items, and social connections will be permanently deleted. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: confirmDeleteAccount },
      ]
    );
  };

  const confirmDeleteAccount = () => {
    Alert.alert(
      'Final Confirmation',
      'This will permanently delete your account and all your data.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete My Account',
          style: 'destructive',
          onPress: executeDeleteAccount,
        },
      ]
    );
  };

  const executeDeleteAccount = async () => {
    setIsDeleting(true);
    const { error } = await deleteAccount();

    if (error) {
      setIsDeleting(false);
      Alert.alert('Error', 'Failed to delete account. Please try again.');
    }
  };

  const handleChangeEmail = async () => {
    setEmailError(null);

    const trimmedEmail = newEmail.trim();
    if (!trimmedEmail) {
      setEmailError('Please enter an email address');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setEmailError('Please enter a valid email address');
      return;
    }

    setEmailLoading(true);

    const { error } = await supabase.auth.updateUser({ email: trimmedEmail });

    setEmailLoading(false);

    if (error) {
      setEmailError(error.message);
    } else {
      Alert.alert(
        'Confirmation Sent',
        'A confirmation link has been sent to your new email address. Please check your inbox to complete the change.',
        [{ text: 'OK', onPress: () => setActiveSection('menu') }]
      );
      setNewEmail('');
    }
  };

  const handleChangePassword = async () => {
    setPasswordError(null);

    if (!newPassword) {
      setPasswordError('Please enter a new password');
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }

    setPasswordLoading(true);

    const { error } = await supabase.auth.updateUser({ password: newPassword });

    setPasswordLoading(false);

    if (error) {
      setPasswordError(error.message);
    } else {
      Alert.alert('Success', 'Your password has been updated.', [
        { text: 'OK', onPress: () => setActiveSection('menu') },
      ]);
      setNewPassword('');
      setConfirmPassword('');
    }
  };

  const handleBack = () => {
    if (activeSection === 'menu') {
      router.back();
    } else {
      setActiveSection('menu');
      setNewEmail('');
      setNewPassword('');
      setConfirmPassword('');
      setEmailError(null);
      setPasswordError(null);
    }
  };

  const getHeaderTitle = () => {
    switch (activeSection) {
      case 'email':
        return 'Change Email';
      case 'password':
        return 'Change Password';
      default:
        return 'Your Account';
    }
  };

  const renderMenu = () => (
    <>
      <View style={styles.settingsList}>
        {/* Change Email */}
        <Pressable
          style={({ pressed }) => [styles.settingsRow, pressed && styles.rowPressed]}
          onPress={() => setActiveSection('email')}
        >
          <Text style={styles.settingsRowText}>Change Email</Text>
          <IconSymbol name="chevron.right" size={16} color={Colors.textMuted} />
        </Pressable>

        <View style={styles.divider} />

        {/* Change Password */}
        <Pressable
          style={({ pressed }) => [styles.settingsRow, pressed && styles.rowPressed]}
          onPress={() => setActiveSection('password')}
        >
          <Text style={styles.settingsRowText}>Change Password</Text>
          <IconSymbol name="chevron.right" size={16} color={Colors.textMuted} />
        </Pressable>
      </View>

      {/* Delete Account - Separate section */}
      <View style={[styles.settingsList, styles.dangerSection]}>
        <Pressable
          style={({ pressed }) => [
            styles.settingsRow,
            pressed && styles.rowPressed,
            isDeleting && styles.rowDisabled,
          ]}
          onPress={handleDeleteAccount}
          disabled={isDeleting}
        >
          {isDeleting ? (
            <ActivityIndicator size="small" color={Colors.error} />
          ) : (
            <Text style={styles.deleteAccountText}>Delete Account</Text>
          )}
        </Pressable>
      </View>
    </>
  );

  const renderEmailForm = () => (
    <KeyboardAvoidingView
      style={styles.formContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.formContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.currentInfo}>Current email: {user?.email}</Text>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>New Email</Text>
          <TextInput
            style={[styles.input, emailError && styles.inputError]}
            value={newEmail}
            onChangeText={(text) => {
              setNewEmail(text);
              setEmailError(null);
            }}
            placeholder="newemail@example.com"
            placeholderTextColor={Colors.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
          />
          {emailError && <Text style={styles.errorText}>{emailError}</Text>}
        </View>

        <Text style={styles.infoText}>
          A confirmation link will be sent to your new email address.
        </Text>

        <Pressable
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
            emailLoading && styles.buttonDisabled,
          ]}
          onPress={handleChangeEmail}
          disabled={emailLoading}
        >
          {emailLoading ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={styles.buttonText}>Update Email</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );

  const renderPasswordForm = () => (
    <KeyboardAvoidingView
      style={styles.formContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.formContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.inputContainer}>
          <Text style={styles.label}>New Password</Text>
          <View style={styles.passwordContainer}>
            <TextInput
              style={styles.passwordInput}
              value={newPassword}
              onChangeText={(text) => {
                setNewPassword(text);
                setPasswordError(null);
              }}
              placeholder="••••••••"
              placeholderTextColor={Colors.textMuted}
              secureTextEntry={!showPassword}
              autoFocus
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
              onChangeText={(text) => {
                setConfirmPassword(text);
                setPasswordError(null);
              }}
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
          {passwordError && <Text style={styles.errorText}>{passwordError}</Text>}
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
            passwordLoading && styles.buttonDisabled,
          ]}
          onPress={handleChangePassword}
          disabled={passwordLoading}
        >
          {passwordLoading ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={styles.buttonText}>Update Password</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable style={styles.backButton} onPress={handleBack}>
          <IconSymbol name="chevron.left" size={20} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>{getHeaderTitle()}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Content */}
      {activeSection === 'menu' && renderMenu()}
      {activeSection === 'email' && renderEmailForm()}
      {activeSection === 'password' && renderPasswordForm()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.md,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dust,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: Fonts.serifBold,
    fontSize: FontSizes.xl,
    color: Colors.text,
  },
  headerSpacer: {
    width: 36,
  },
  settingsList: {
    marginTop: Spacing.lg,
    marginHorizontal: Spacing.xl,
    backgroundColor: Colors.dust,
    borderRadius: BorderRadius.md,
  },
  dangerSection: {
    marginTop: Spacing['2xl'],
  },
  settingsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowDisabled: {
    opacity: 0.5,
  },
  settingsRowText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.text,
  },
  deleteAccountText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.error,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.lg,
  },
  formContainer: {
    flex: 1,
  },
  formContent: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    gap: Spacing.lg,
  },
  currentInfo: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
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
  inputError: {
    borderBottomColor: Colors.error,
    borderBottomWidth: 2,
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
  errorText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.error,
    marginTop: Spacing.xs,
  },
  infoText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
    lineHeight: 20,
  },
  button: {
    backgroundColor: Colors.handwriting,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.sm,
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
    fontSize: FontSizes.sm,
    color: Colors.white,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
});
