import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts, FontSizes, Spacing } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';

export default function ListsScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <View>
          <Text style={styles.archiveLabel}>ARCHIVE NO. 007</Text>
          <Text style={styles.title}>Personal Archive</Text>
        </View>
        <Pressable style={styles.iconButton}>
          <IconSymbol name="magnifyingglass" size={22} color={Colors.text} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Rankings Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Top Rankings</Text>
          <Pressable>
            <Text style={styles.viewAll}>VIEW ALL</Text>
          </Pressable>
        </View>

        {/* Placeholder for rankings */}
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>
            Your ranked movies will appear here
          </Text>
        </View>

        {/* Watchlist Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Watchlist</Text>
          <Pressable>
            <Text style={styles.viewAll}>GRID VIEW</Text>
          </Pressable>
        </View>

        {/* Placeholder for watchlist */}
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>
            Your bookmarked movies will appear here
          </Text>
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
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  archiveLabel: {
    fontFamily: Fonts?.sans,
    fontSize: FontSizes.xs,
    color: Colors.stamp,
    letterSpacing: 1,
    marginBottom: Spacing.xs,
  },
  title: {
    fontFamily: Fonts?.serif,
    fontSize: FontSizes['3xl'],
    fontWeight: '700',
    color: Colors.text,
  },
  iconButton: {
    padding: Spacing.xs,
    marginTop: Spacing.md,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing['3xl'],
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: Spacing.lg,
    marginTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.lg,
  },
  sectionTitle: {
    fontFamily: Fonts?.serif,
    fontSize: FontSizes.xl,
    fontStyle: 'italic',
    color: Colors.text,
  },
  viewAll: {
    fontFamily: Fonts?.sans,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    letterSpacing: 1,
  },
  placeholder: {
    paddingVertical: Spacing['2xl'],
    alignItems: 'center',
  },
  placeholderText: {
    fontFamily: Fonts?.sans,
    fontSize: FontSizes.md,
    color: Colors.textMuted,
    textAlign: 'center',
  },
});
