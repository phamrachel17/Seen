import { View, Text, StyleSheet, Pressable, ScrollView, Modal } from 'react-native';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';

interface DropdownOption {
  id: string;
  label: string;
}

interface InlineDropdownProps {
  visible: boolean;
  onClose: () => void;
  options: DropdownOption[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
  anchorPosition?: { top: number; left: number; width: number } | null;
}

export function InlineDropdown({
  visible,
  onClose,
  options,
  selectedId,
  onSelect,
  anchorPosition,
}: InlineDropdownProps) {
  if (!visible || !anchorPosition) return null;

  const handleSelect = (id: string) => {
    onSelect(id);
    onClose();
  };

  return (
    <Modal transparent visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <View
          style={[
            styles.dropdown,
            {
              top: anchorPosition.top,
              left: anchorPosition.left,
              minWidth: anchorPosition.width,
            },
          ]}
        >
          <ScrollView
            style={styles.scrollView}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {options.map((option) => {
              const isSelected = selectedId === option.id;
              return (
                <Pressable
                  key={option.id}
                  style={[
                    styles.option,
                    isSelected && styles.optionSelected,
                  ]}
                  onPress={() => handleSelect(option.id)}
                >
                  <Text
                    style={[
                      styles.optionText,
                      isSelected && styles.optionTextSelected,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
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
    maxHeight: 220,
    shadowColor: Colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
    overflow: 'hidden',
  },
  scrollView: {
    maxHeight: 220,
  },
  option: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  optionSelected: {
    backgroundColor: Colors.stamp,
  },
  optionText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.text,
  },
  optionTextSelected: {
    color: Colors.paper,
    fontFamily: Fonts.sansMedium,
  },
});
