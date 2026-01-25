import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Colors, Fonts, FontSizes, Spacing } from '@/constants/theme';
import { IconSymbol, IconSymbolName } from '@/components/ui/icon-symbol';

interface ProfileListRowProps {
  title: string;
  count: number;
  onPress: () => void;
  icon?: IconSymbolName;
}

export function ProfileListRow({ title, count, onPress, icon }: ProfileListRowProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      onPress={onPress}
    >
      <View style={styles.leftContent}>
        {icon && (
          <IconSymbol name={icon} size={18} color={Colors.stamp} />
        )}
        <Text style={styles.title}>{title}</Text>
      </View>
      <View style={styles.rightContent}>
        <Text style={styles.count}>{count} {count === 1 ? 'title' : 'titles'}</Text>
        <IconSymbol name="chevron.right" size={16} color={Colors.textMuted} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.lg,
  },
  pressed: {
    opacity: 0.8,
  },
  leftContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  title: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.md,
    color: Colors.text,
  },
  rightContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  count: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
  },
});
