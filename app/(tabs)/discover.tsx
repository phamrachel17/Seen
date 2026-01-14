import { View, Text, TextInput, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';

export default function DiscoverScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Text style={styles.title}>Seen</Text>
        <View style={styles.headerActions}>
          <Pressable style={styles.iconButton}>
            <IconSymbol name="bell" size={22} color={Colors.text} />
          </Pressable>
          <Pressable style={styles.iconButton}>
            <IconSymbol name="person" size={22} color={Colors.text} />
          </Pressable>
        </View>
      </View>

      {/* Search bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <IconSymbol name="magnifyingglass" size={18} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search directors, titles, years..."
            placeholderTextColor={Colors.textMuted}
          />
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Curated List Header */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>The Curated List</Text>
          <Text style={styles.issueNumber}>ISSUE NO. 04</Text>
        </View>

        {/* Placeholder for movie grid */}
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>
            Discover new films here
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
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.md,
  },
  title: {
    fontFamily: Fonts?.serif,
    fontSize: FontSizes['3xl'],
    fontWeight: '700',
    fontStyle: 'italic',
    color: Colors.stamp,
  },
  headerActions: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  iconButton: {
    padding: Spacing.xs,
  },
  searchContainer: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontFamily: Fonts?.sans,
    fontSize: FontSizes.md,
    color: Colors.text,
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
  },
  sectionTitle: {
    fontFamily: Fonts?.serif,
    fontSize: FontSizes['2xl'],
    fontStyle: 'italic',
    color: Colors.stamp,
  },
  issueNumber: {
    fontFamily: Fonts?.sans,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    letterSpacing: 1,
  },
  placeholder: {
    paddingVertical: Spacing['4xl'],
    alignItems: 'center',
  },
  placeholderText: {
    fontFamily: Fonts?.sans,
    fontSize: FontSizes.md,
    color: Colors.textMuted,
    textAlign: 'center',
  },
});
