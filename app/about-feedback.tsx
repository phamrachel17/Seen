import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';

export default function AboutFeedbackScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleFeedbackPress = () => {
    WebBrowser.openBrowserAsync('https://tally.so/r/gD44WK');
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <IconSymbol name="chevron.left" size={20} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>About & Feedback</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* About Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitleRed}>Why Seen?</Text>
          <Text style={styles.bodyText}>
            Hey there! I made Seen because I always forget what I've watched, which episode or season I'm on, and sometimes even if I actually liked a show or movie.
          </Text>
          <Text style={styles.bodyText}>
            Nothing out there made it easy or fun to track and rank my screen time, so I built this little space for myself — and now you get to use it too!
          </Text>
        </View>

        {/* Feedback Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitleRed}>Share Your Feedback</Text>
          <Text style={styles.bodyText}>
            I'd love to hear your thoughts. Bugs, suggestions, or little fixes — send them my way! This is the first app I've ever built, and your feedback will help me make it better.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.feedbackButton, pressed && styles.feedbackButtonPressed]}
            onPress={handleFeedbackPress}
          >
            <IconSymbol name="square.and.pencil" size={18} color={Colors.stamp} />
            <Text style={styles.feedbackText}>Share feedback</Text>
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
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.xl,
    paddingBottom: Spacing['3xl'],
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    fontFamily: Fonts.serifSemiBold,
    fontSize: FontSizes.lg,
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  sectionTitleRed: {
    fontFamily: Fonts.serifBold,
    fontSize: FontSizes.lg,
    color: Colors.stamp,
    marginBottom: Spacing.md,
  },
  bodyText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
    lineHeight: 24,
    marginBottom: Spacing.md,
  },
  feedbackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.dust,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignSelf: 'flex-start',
    marginTop: Spacing.sm,
  },
  feedbackButtonPressed: {
    opacity: 0.7,
  },
  feedbackText: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.md,
    color: Colors.stamp,
  },
});
