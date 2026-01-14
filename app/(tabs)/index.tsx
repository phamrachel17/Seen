import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { ScreenHeader } from '@/components/screen-header';
import { Colors, Fonts, FontSizes, Spacing } from '@/constants/theme';

export default function FeedScreen() {
  return (
    <View style={styles.container}>
      <ScreenHeader showNotification />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionTitle}>The Ledger</Text>

        {/* Placeholder for feed items */}
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>
            Your friends&apos; activity will appear here
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing['3xl'],
  },
  sectionTitle: {
    fontFamily: Fonts?.serif,
    fontSize: FontSizes['2xl'],
    fontStyle: 'italic',
    color: Colors.text,
    marginBottom: Spacing.xl,
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
