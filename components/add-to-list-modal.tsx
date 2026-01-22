import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/lib/auth-context';
import {
  getUserLists,
  addToList,
  removeFromList,
  getListsContainingContent,
} from '@/lib/user-lists';
import { UserList } from '@/types';

interface AddToListModalProps {
  visible: boolean;
  onClose: () => void;
  contentId: number;
  contentTitle: string;
}

export function AddToListModal({
  visible,
  onClose,
  contentId,
  contentTitle,
}: AddToListModalProps) {
  const router = useRouter();
  const { user } = useAuth();

  const [lists, setLists] = useState<UserList[]>([]);
  const [listStates, setListStates] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [updatingLists, setUpdatingLists] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (visible && user) {
      loadLists();
    }
  }, [visible, user, contentId]);

  const loadLists = async () => {
    if (!user) return;

    setIsLoading(true);

    const [userLists, containingLists] = await Promise.all([
      getUserLists(user.id),
      getListsContainingContent(user.id, contentId),
    ]);

    setLists(userLists);

    // Build a map of which lists contain this content
    const states: Record<string, boolean> = {};
    for (const list of userLists) {
      const containing = containingLists.find((c) => c.listId === list.id);
      states[list.id] = containing?.inList || false;
    }
    setListStates(states);

    setIsLoading(false);
  };

  const handleToggleList = async (listId: string) => {
    if (updatingLists.has(listId)) return;

    const isCurrentlyInList = listStates[listId];

    // Optimistic update
    setListStates((prev) => ({ ...prev, [listId]: !isCurrentlyInList }));
    setUpdatingLists((prev) => new Set(prev).add(listId));

    let success: boolean;
    if (isCurrentlyInList) {
      success = await removeFromList(listId, contentId);
    } else {
      success = await addToList(listId, contentId);
    }

    if (!success) {
      // Revert on failure
      setListStates((prev) => ({ ...prev, [listId]: isCurrentlyInList }));
    }

    setUpdatingLists((prev) => {
      const next = new Set(prev);
      next.delete(listId);
      return next;
    });
  };

  const handleCreateList = () => {
    onClose();
    router.push('/create-list' as any);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerSpacer} />
          <Text style={styles.headerTitle}>Add to List</Text>
          <Pressable style={styles.closeButton} onPress={onClose}>
            <IconSymbol name="xmark" size={20} color={Colors.text} />
          </Pressable>
        </View>

        {/* Content Title */}
        <Text style={styles.contentTitle} numberOfLines={1}>
          {contentTitle}
        </Text>

        {/* Lists */}
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.stamp} />
          </View>
        ) : (
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.listContent}
          >
            {lists.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>
                  You haven't created any lists yet
                </Text>
              </View>
            ) : (
              lists.map((list) => (
                <Pressable
                  key={list.id}
                  style={({ pressed }) => [
                    styles.listRow,
                    pressed && styles.listRowPressed,
                  ]}
                  onPress={() => handleToggleList(list.id)}
                  disabled={updatingLists.has(list.id)}
                >
                  <View style={styles.listIconContainer}>
                    <IconSymbol
                      name={list.icon_name as any}
                      size={20}
                      color={Colors.text}
                    />
                  </View>
                  <View style={styles.listInfo}>
                    <Text style={styles.listName}>{list.name}</Text>
                    <Text style={styles.listCount}>
                      {list.item_count || 0} items
                    </Text>
                  </View>
                  <View style={styles.checkboxContainer}>
                    {updatingLists.has(list.id) ? (
                      <ActivityIndicator size="small" color={Colors.stamp} />
                    ) : (
                      <View
                        style={[
                          styles.checkbox,
                          listStates[list.id] && styles.checkboxChecked,
                        ]}
                      >
                        {listStates[list.id] && (
                          <IconSymbol name="checkmark" size={14} color={Colors.white} />
                        )}
                      </View>
                    )}
                  </View>
                </Pressable>
              ))
            )}

            {/* Create New List Button */}
            <Pressable
              style={({ pressed }) => [
                styles.createListButton,
                pressed && styles.createListButtonPressed,
              ]}
              onPress={handleCreateList}
            >
              <View style={styles.createListIconContainer}>
                <IconSymbol name="plus" size={20} color={Colors.stamp} />
              </View>
              <Text style={styles.createListText}>Create New List</Text>
            </Pressable>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.md,
  },
  headerSpacer: {
    width: 36,
  },
  headerTitle: {
    fontFamily: Fonts.serifBold,
    fontSize: FontSizes.lg,
    color: Colors.text,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dust,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentTitle: {
    fontFamily: Fonts.serifSemiBold,
    fontSize: FontSizes.md,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing['3xl'],
  },
  emptyState: {
    paddingVertical: Spacing['2xl'],
    alignItems: 'center',
  },
  emptyStateText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.textMuted,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  listRowPressed: {
    opacity: 0.7,
  },
  listIconContainer: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dust,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  listInfo: {
    flex: 1,
  },
  listName: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.md,
    color: Colors.text,
  },
  listCount: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
    marginTop: 2,
  },
  checkboxContainer: {
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: BorderRadius.sm,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: Colors.stamp,
    borderColor: Colors.stamp,
  },
  createListButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    marginTop: Spacing.md,
  },
  createListButtonPressed: {
    opacity: 0.7,
  },
  createListIconContainer: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.cardBackground,
    borderWidth: 1,
    borderColor: Colors.stamp,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  createListText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.md,
    color: Colors.stamp,
  },
});
