import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts, FontSizes, Spacing } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';

interface ScreenHeaderProps {
  showNotification?: boolean;
  showProfile?: boolean;
  rightAction?: {
    icon: 'bell' | 'ellipsis' | 'magnifyingglass';
    onPress: () => void;
  };
  secondaryAction?: {
    icon: 'bell' | 'ellipsis' | 'magnifyingglass' | 'square.and.arrow.up';
    onPress: () => void;
  };
}

export function ScreenHeader({
  showNotification,
  rightAction,
  secondaryAction,
}: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top + Spacing.md }]}>
      <Text style={styles.title}>Seen</Text>

      <View style={styles.actions}>
        {secondaryAction && (
          <Pressable onPress={secondaryAction.onPress} style={styles.iconButton}>
            <IconSymbol name={secondaryAction.icon} size={22} color={Colors.text} />
          </Pressable>
        )}
        {rightAction && (
          <Pressable onPress={rightAction.onPress} style={styles.iconButton}>
            <IconSymbol name={rightAction.icon} size={22} color={Colors.text} />
          </Pressable>
        )}
        {showNotification && (
          <Pressable style={styles.iconButton}>
            <IconSymbol name="bell" size={22} color={Colors.text} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.background,
  },
  title: {
    fontFamily: Fonts?.serif,
    fontSize: FontSizes['3xl'],
    fontWeight: '700',
    fontStyle: 'italic',
    color: Colors.stamp,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  iconButton: {
    padding: Spacing.xs,
  },
});
