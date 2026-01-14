import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/lib/auth-context';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { signOut, user } = useAuth();

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
        <Pressable style={styles.iconButton}>
          <IconSymbol name="ellipsis" size={22} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>SEEN</Text>
        <Pressable style={styles.iconButton} onPress={handleSignOut}>
          <View style={styles.settingsIcon}>
            <IconSymbol name="arrow.left" size={18} color={Colors.textMuted} />
          </View>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Image Placeholder */}
        <View style={styles.profileImageContainer}>
          <View style={styles.profileImagePlaceholder}>
            <Text style={styles.profileImageText}>Profile Image</Text>
          </View>
          <Text style={styles.profileName}>
            {user?.user_metadata?.username?.toUpperCase() || 'YOUR NAME'}
          </Text>
        </View>

        {/* Curation Identity */}
        <View style={styles.identitySection}>
          <Text style={styles.identityLabel}>CURATION IDENTITY</Text>
          <View style={styles.identityRow}>
            <Text style={styles.identityValue}>Film Enthusiast</Text>
            <View style={styles.followStats}>
              <View style={styles.followStat}>
                <Text style={styles.followNumber}>0</Text>
                <Text style={styles.followLabel}>Following</Text>
              </View>
              <View style={styles.followStat}>
                <Text style={styles.followNumber}>0</Text>
                <Text style={styles.followLabel}>Followers</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsContainer}>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>0</Text>
            <Text style={styles.statLabel}>FILMS</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>0</Text>
            <Text style={styles.statLabel}>DAYS</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>—</Text>
            <Text style={styles.statLabel}>RANK</Text>
          </View>
        </View>

        {/* Recent Archives */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>RECENT ARCHIVES</Text>
            <Pressable>
              <Text style={styles.viewAll}>VIEW ALL</Text>
            </Pressable>
          </View>
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>
              Your recent activity will appear here
            </Text>
          </View>
        </View>

        {/* Sign Out Button */}
        <View style={styles.signOutSection}>
          <Pressable
            style={({ pressed }) => [
              styles.signOutButton,
              pressed && styles.signOutButtonPressed,
            ]}
            onPress={handleSignOut}
          >
            <Text style={styles.signOutText}>Sign Out</Text>
          </Pressable>
        </View>
      </ScrollView>
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
  headerTitle: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.md,
    color: Colors.text,
    letterSpacing: 2,
  },
  iconButton: {
    padding: Spacing.xs,
  },
  settingsIcon: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dust,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Spacing['3xl'],
  },
  profileImageContainer: {
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  profileImagePlaceholder: {
    width: '100%',
    aspectRatio: 3 / 4,
    backgroundColor: Colors.dust,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  profileImageText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.textMuted,
  },
  profileName: {
    fontFamily: Fonts.serifBold,
    fontSize: FontSizes['4xl'],
    color: Colors.text,
    letterSpacing: 2,
  },
  identitySection: {
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.lg,
  },
  identityLabel: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    letterSpacing: 1,
    marginBottom: Spacing.xs,
  },
  identityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  identityValue: {
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.xl,
    color: Colors.stamp,
  },
  followStats: {
    alignItems: 'flex-end',
  },
  followStat: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.xs,
  },
  followNumber: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.md,
    color: Colors.text,
  },
  followLabel: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
  },
  statsContainer: {
    flexDirection: 'row',
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.xl,
    paddingVertical: Spacing.lg,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    fontFamily: Fonts.serifBold,
    fontSize: FontSizes['2xl'],
    color: Colors.text,
  },
  statLabel: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    letterSpacing: 1,
    marginTop: Spacing.xs,
  },
  statDivider: {
    width: 1,
    backgroundColor: Colors.border,
  },
  section: {
    marginTop: Spacing.xl,
    paddingHorizontal: Spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: Spacing.lg,
  },
  sectionLabel: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    letterSpacing: 1,
  },
  viewAll: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.xs,
    color: Colors.navy,
  },
  placeholder: {
    paddingVertical: Spacing['2xl'],
    alignItems: 'center',
  },
  placeholderText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  signOutSection: {
    marginTop: Spacing['2xl'],
    paddingHorizontal: Spacing.xl,
  },
  signOutButton: {
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
  },
  signOutButtonPressed: {
    opacity: 0.7,
  },
  signOutText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.textMuted,
  },
});
