import { supabase } from './supabase';
import { UserList, UserListItem, Content } from '@/types';

export async function getUserLists(userId: string): Promise<UserList[]> {
  const { data: lists, error } = await supabase
    .from('user_lists')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching user lists:', error);
    return [];
  }

  // Get item counts for each list
  const listsWithCounts = await Promise.all(
    (lists || []).map(async (list) => {
      const { count } = await supabase
        .from('user_list_items')
        .select('*', { count: 'exact', head: true })
        .eq('list_id', list.id);

      return {
        ...list,
        item_count: count || 0,
      };
    })
  );

  return listsWithCounts;
}

export async function getListWithItems(listId: string): Promise<{
  list: UserList | null;
  items: UserListItem[];
}> {
  const { data: list, error: listError } = await supabase
    .from('user_lists')
    .select('*')
    .eq('id', listId)
    .single();

  if (listError || !list) {
    console.error('Error fetching list:', listError);
    return { list: null, items: [] };
  }

  const { data: items, error: itemsError } = await supabase
    .from('user_list_items')
    .select(`
      *,
      content:content_id (*)
    `)
    .eq('list_id', listId)
    .order('position', { ascending: true });

  if (itemsError) {
    console.error('Error fetching list items:', itemsError);
    return { list, items: [] };
  }

  const formattedItems: UserListItem[] = (items || []).map((item: any) => ({
    id: item.id,
    list_id: item.list_id,
    content_id: item.content_id,
    position: item.position,
    added_at: item.added_at,
    content: item.content,
  }));

  return { list, items: formattedItems };
}

export async function createList(
  userId: string,
  name: string,
  description?: string,
  iconName: string = 'list.bullet'
): Promise<UserList | null> {
  const { data, error } = await supabase
    .from('user_lists')
    .insert({
      user_id: userId,
      name,
      description: description || null,
      icon_name: iconName,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating list:', error);
    return null;
  }

  return data;
}

export async function updateList(
  listId: string,
  updates: Partial<Pick<UserList, 'name' | 'description' | 'icon_name' | 'is_public'>>
): Promise<boolean> {
  const { error } = await supabase
    .from('user_lists')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', listId);

  if (error) {
    console.error('Error updating list:', error);
    return false;
  }

  return true;
}

export async function deleteList(listId: string): Promise<boolean> {
  const { error } = await supabase
    .from('user_lists')
    .delete()
    .eq('id', listId);

  if (error) {
    console.error('Error deleting list:', error);
    return false;
  }

  return true;
}

export async function addToList(listId: string, contentId: number): Promise<boolean> {
  // Get current max position
  const { data: existing } = await supabase
    .from('user_list_items')
    .select('position')
    .eq('list_id', listId)
    .order('position', { ascending: false })
    .limit(1);

  const nextPosition = existing && existing.length > 0 ? existing[0].position + 1 : 0;

  const { error } = await supabase
    .from('user_list_items')
    .insert({
      list_id: listId,
      content_id: contentId,
      position: nextPosition,
    });

  if (error) {
    // Might be a unique constraint violation (already in list)
    if (error.code === '23505') {
      return true; // Already in list, consider it success
    }
    console.error('Error adding to list:', error);
    return false;
  }

  return true;
}

export async function removeFromList(listId: string, contentId: number): Promise<boolean> {
  const { error } = await supabase
    .from('user_list_items')
    .delete()
    .eq('list_id', listId)
    .eq('content_id', contentId);

  if (error) {
    console.error('Error removing from list:', error);
    return false;
  }

  return true;
}

export async function isContentInList(listId: string, contentId: number): Promise<boolean> {
  const { data, error } = await supabase
    .from('user_list_items')
    .select('id')
    .eq('list_id', listId)
    .eq('content_id', contentId)
    .maybeSingle();

  if (error) {
    console.error('Error checking content in list:', error);
    return false;
  }

  return !!data;
}

export async function getListsContainingContent(
  userId: string,
  contentId: number
): Promise<{ listId: string; inList: boolean }[]> {
  // Get all user's lists
  const { data: lists, error: listsError } = await supabase
    .from('user_lists')
    .select('id')
    .eq('user_id', userId);

  if (listsError || !lists) {
    console.error('Error fetching lists:', listsError);
    return [];
  }

  // Check which lists contain this content
  const results = await Promise.all(
    lists.map(async (list) => {
      const inList = await isContentInList(list.id, contentId);
      return { listId: list.id, inList };
    })
  );

  return results;
}

export async function reorderListItems(listId: string, itemIds: string[]): Promise<boolean> {
  // Update each item with its new position
  const updates = itemIds.map((id, index) =>
    supabase
      .from('user_list_items')
      .update({ position: index })
      .eq('id', id)
      .eq('list_id', listId)
  );

  const results = await Promise.all(updates);
  const hasError = results.some((result) => result.error);

  if (hasError) {
    console.error('Error reordering list items');
    return false;
  }

  return true;
}
