import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { MovieGrid } from '@/components/movie-card';
import { getPersonDetails, getPersonCombinedCredits } from '@/lib/tmdb';
import { PersonDetails, Movie, TVShow } from '@/types';

const PHOTO_SIZE = 120;

export default function PersonDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string }>();
  const personId = params.id ? Number(params.id) : 0;

  const [person, setPerson] = useState<PersonDetails | null>(null);
  const [credits, setCredits] = useState<(Movie | TVShow)[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showFullBio, setShowFullBio] = useState(false);

  const loadData = useCallback(async () => {
    if (!personId) return;
    try {
      const [details, combinedCredits] = await Promise.all([
        getPersonDetails(personId),
        getPersonCombinedCredits(personId),
      ]);
      setPerson(details);
      setCredits(combinedCredits);
    } catch (error) {
      console.error('Error loading person details:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [personId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadData();
  }, [loadData]);

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!person) {
    return (
      <View style={[styles.errorContainer, { paddingTop: insets.top }]}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <IconSymbol name="chevron.left" size={20} color={Colors.text} />
        </Pressable>
        <Text style={styles.errorText}>Person not found</Text>
      </View>
    );
  }

  const initials = person.name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const formatBirthday = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const calculateAge = (birthday: string, deathday?: string | null) => {
    const birth = new Date(birthday + 'T00:00:00');
    const end = deathday ? new Date(deathday + 'T00:00:00') : new Date();
    let age = end.getFullYear() - birth.getFullYear();
    const monthDiff = end.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && end.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

  const bioLineLimit = 4;
  const hasBio = person.biography && person.biography.trim().length > 0;

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing['3xl'] }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.stamp}
          />
        }
      >
        {/* Header with back button */}
        <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
          <Pressable
            style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.7 }]}
            onPress={() => router.back()}
          >
            <IconSymbol name="chevron.left" size={20} color={Colors.text} />
          </Pressable>
        </View>

        {/* Profile Section */}
        <View style={styles.profileSection}>
          {person.profile_url ? (
            <Image
              source={{ uri: person.profile_url }}
              style={styles.photo}
              contentFit="cover"
              transition={200}
            />
          ) : (
            <View style={styles.photoFallback}>
              <Text style={styles.photoInitials}>{initials}</Text>
            </View>
          )}

          <Text style={styles.name}>{person.name}</Text>
          <Text style={styles.department}>{person.known_for_department}</Text>

          {/* Birth info */}
          {person.birthday && (
            <Text style={styles.birthInfo}>
              Born: {formatBirthday(person.birthday)} (age {calculateAge(person.birthday, person.deathday)})
              {person.deathday && ` — Died: ${formatBirthday(person.deathday)}`}
            </Text>
          )}
          {person.place_of_birth && (
            <Text style={styles.birthPlace}>{person.place_of_birth}</Text>
          )}
        </View>

        {/* Biography */}
        {hasBio && (
          <View style={styles.bioSection}>
            <Text style={styles.sectionTitle}>About</Text>
            <Text
              style={styles.bioText}
              numberOfLines={showFullBio ? undefined : bioLineLimit}
            >
              {person.biography}
            </Text>
            <Pressable
              style={styles.bioToggle}
              onPress={() => setShowFullBio(!showFullBio)}
            >
              <Text style={styles.bioToggleText}>
                {showFullBio ? 'Show less' : 'Show more'}
              </Text>
            </Pressable>
          </View>
        )}

        {/* Known For */}
        {credits.length > 0 && (
          <View style={styles.creditsSection}>
            <Text style={styles.sectionTitle}>Also in</Text>
            <MovieGrid movies={credits} columns={3} />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.cardBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileSection: {
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
  },
  photo: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: PHOTO_SIZE / 2,
    backgroundColor: Colors.dust,
  },
  photoFallback: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: PHOTO_SIZE / 2,
    backgroundColor: Colors.dust,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoInitials: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes['3xl'],
    color: Colors.textMuted,
  },
  name: {
    fontFamily: Fonts.serifBold,
    fontSize: FontSizes['2xl'],
    color: Colors.text,
    textAlign: 'center',
    marginTop: Spacing.lg,
  },
  department: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
  },
  birthInfo: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
    marginTop: Spacing.md,
    textAlign: 'center',
  },
  birthPlace: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
    textAlign: 'center',
  },
  bioSection: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
  },
  sectionTitle: {
    fontFamily: Fonts.serifExtraBold,
    fontSize: FontSizes['2xl'],
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  bioText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.text,
    lineHeight: FontSizes.md * 1.6,
  },
  bioToggle: {
    marginTop: Spacing.sm,
  },
  bioToggleText: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.sm,
    color: Colors.stamp,
  },
  creditsSection: {
    paddingTop: Spacing.sm,
    paddingHorizontal: Spacing.xl,
  },
  errorContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: Spacing.lg,
  },
  errorText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Spacing['2xl'],
  },
});
