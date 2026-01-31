import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/lib/auth-context';

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();

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

        {/* Your Account */}
        <Pressable
          style={({ pressed }) => [styles.settingsRow, pressed && styles.rowPressed]}
          onPress={() => router.push('/account')}
        >
          <Text style={styles.settingsRowText}>Your Account</Text>
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
      </View>

      {/* About & Feedback - fun playful section */}
      <Pressable
        style={({ pressed }) => [styles.aboutSection, pressed && styles.aboutPressed]}
        onPress={() => router.push('/about-feedback')}
      >
        <View style={styles.aboutContent}>
          <Text style={styles.aboutEmoji}>💌</Text>
          <View style={styles.aboutTextContainer}>
            <Text style={styles.aboutTitle}>Say hi!</Text>
            <Text style={styles.aboutSubtitle}>About & Feedback</Text>
          </View>
        </View>
        <IconSymbol name="chevron.right" size={16} color={Colors.stamp} />
      </Pressable>
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
  settingsRowText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.text,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.lg,
  },
  aboutSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.xl,
    marginHorizontal: Spacing.xl,
    backgroundColor: 'rgba(128, 47, 29, 0.08)',
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.stamp,
    borderStyle: 'dashed',
  },
  aboutPressed: {
    opacity: 0.7,
    backgroundColor: Colors.cardBackground,
  },
  aboutContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  aboutEmoji: {
    fontSize: 24,
  },
  aboutTextContainer: {
    gap: 2,
  },
  aboutTitle: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.md,
    color: Colors.stamp,
  },
  aboutSubtitle: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
  },
});
