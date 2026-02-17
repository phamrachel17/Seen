import { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Fonts, FontSizes, Spacing } from '@/constants/theme';
import { SegmentedControl } from './segmented-control';
import { PersonCard } from './person-card';
import { CastMember, CrewMember } from '@/types';

interface CastCrewSectionProps {
  cast: CastMember[];
  crew: CrewMember[];
}

export function CastCrewSection({ cast, crew }: CastCrewSectionProps) {
  const router = useRouter();
  const [selectedTab, setSelectedTab] = useState(0);

  const showCast = selectedTab === 0;
  const items = showCast ? cast : crew;

  if (cast.length === 0 && crew.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      {/* Section Header */}
      <View style={styles.header}>
        <Text style={styles.sectionTitle}>CAST & CREW</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <SegmentedControl
          segments={['Cast', 'Crew']}
          selectedIndex={selectedTab}
          onSelect={setSelectedTab}
        />
      </View>

      {/* Horizontal Scroll */}
      {items.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {items.map((item) => (
            <PersonCard
              key={item.id}
              name={item.name}
              role={showCast ? (item as CastMember).character : (item as CrewMember).job}
              imageUrl={item.profile_url}
              onPress={() => router.push(`/person/${item.id}` as any)}
            />
          ))}
        </ScrollView>
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>
            No {showCast ? 'cast' : 'crew'} information available
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: Spacing.lg,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    letterSpacing: 1.5,
  },
  tabsContainer: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  emptyState: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
  },
  emptyText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
  },
});
