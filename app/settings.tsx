import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/lib/auth-context';

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signOut, deleteAccount } = useAuth();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: signOut },
      ]
    );
  };

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

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <IconSymbol name="chevron.left" size={20} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Settings List */}
      <View style={styles.settingsList}>
        {/* Edit Profile */}
        <Pressable
          style={({ pressed }) => [styles.settingsRow, pressed && styles.rowPressed]}
          onPress={() => router.push('/edit-profile')}
        >
          <Text style={styles.settingsRowText}>Edit Profile</Text>
          <IconSymbol name="chevron.right" size={16} color={Colors.textMuted} />
        </Pressable>

        <View style={styles.divider} />

        {/* Sign Out */}
        <Pressable
          style={({ pressed }) => [styles.settingsRow, pressed && styles.rowPressed]}
          onPress={handleSignOut}
        >
          <Text style={styles.settingsRowText}>Sign Out</Text>
        </Pressable>

        <View style={styles.divider} />

        {/* Delete Account */}
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
});
