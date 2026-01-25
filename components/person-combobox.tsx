import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Modal,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { searchPeople } from '@/lib/tmdb';
import { Person } from '@/types';

interface PersonComboboxProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (person: Person) => void;
  anchorPosition?: { top: number; left: number; width: number } | null;
}

// In-memory cache for search results
const searchCache = new Map<string, Person[]>();

export function PersonCombobox({
  visible,
  onClose,
  onSelect,
  anchorPosition,
}: PersonComboboxProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Person[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<TextInput>(null);

  // Focus input when opened
  useEffect(() => {
    if (visible) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery('');
      setResults([]);
    }
  }, [visible]);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const normalizedQuery = query.trim().toLowerCase();

    // Check cache first
    if (searchCache.has(normalizedQuery)) {
      setResults(searchCache.get(normalizedQuery)!);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsLoading(true);
      try {
        const { people } = await searchPeople(query);
        searchCache.set(normalizedQuery, people);
        setResults(people);
      } catch (error) {
        console.error('Error searching people:', error);
      } finally {
        setIsLoading(false);
      }
    }, 400);

    return () => clearTimeout(timeoutId);
  }, [query]);

  const handleSelect = (person: Person) => {
    onSelect(person);
    setQuery('');
    setResults([]);
    onClose();
  };

  if (!visible || !anchorPosition) return null;

  return (
    <Modal transparent visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <View
          style={[
            styles.dropdown,
            {
              top: anchorPosition.top,
              left: anchorPosition.left,
              width: Math.max(anchorPosition.width, 220),
            },
          ]}
        >
          {/* Search input */}
          <View style={styles.searchContainer}>
            <IconSymbol name="magnifyingglass" size={14} color={Colors.textMuted} />
            <TextInput
              ref={inputRef}
              style={styles.searchInput}
              placeholder="Search actor or director..."
              placeholderTextColor={Colors.textMuted}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="search"
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery('')} hitSlop={8}>
                <IconSymbol name="xmark" size={14} color={Colors.textMuted} />
              </Pressable>
            )}
          </View>

          {/* Results */}
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={Colors.stamp} />
            </View>
          ) : results.length > 0 ? (
            <ScrollView
              style={styles.scrollView}
              showsVerticalScrollIndicator={false}
              bounces={false}
              keyboardShouldPersistTaps="handled"
            >
              {results.slice(0, 8).map((person) => (
                <Pressable
                  key={person.id}
                  style={({ pressed }) => [
                    styles.personItem,
                    pressed && styles.personItemPressed,
                  ]}
                  onPress={() => handleSelect(person)}
                >
                  {person.profile_url ? (
                    <Image
                      source={{ uri: person.profile_url }}
                      style={styles.personImage}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={styles.personImagePlaceholder}>
                      <IconSymbol name="person.fill" size={12} color={Colors.textMuted} />
                    </View>
                  )}
                  <View style={styles.personInfo}>
                    <Text style={styles.personName} numberOfLines={1}>
                      {person.name}
                    </Text>
                    <Text style={styles.personDepartment} numberOfLines={1}>
                      {person.known_for_department}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          ) : query.trim() ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>No results found</Text>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>Type to search</Text>
            </View>
          )}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  dropdown: {
    position: 'absolute',
    backgroundColor: Colors.cardBackground,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    maxHeight: 300,
    shadowColor: Colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
    overflow: 'hidden',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.xs,
  },
  searchInput: {
    flex: 1,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.text,
    paddingVertical: 0,
  },
  scrollView: {
    maxHeight: 240,
  },
  loadingContainer: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
  personItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  personItemPressed: {
    backgroundColor: Colors.dust,
  },
  personImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.dust,
  },
  personImagePlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.dust,
    alignItems: 'center',
    justifyContent: 'center',
  },
  personInfo: {
    flex: 1,
  },
  personName: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.sm,
    color: Colors.text,
  },
  personDepartment: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
  },
  emptyState: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
  emptyStateText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
  },
});
