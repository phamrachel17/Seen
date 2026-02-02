import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase } from './supabase';

// Configure notification behavior when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export interface PushToken {
  id: string;
  user_id: string;
  expo_push_token: string;
  device_name?: string;
  platform?: 'ios' | 'android' | 'web';
  created_at: string;
  updated_at: string;
}

/**
 * Request permission and get Expo push token
 * Returns null if permission denied or on simulator
 */
export async function registerForPushNotifications(): Promise<string | null> {
  // Push notifications only work on physical devices
  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return null;
  }

  // Check existing permission status
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  // Request permission if not already granted
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Push notification permission denied');
    return null;
  }

  // Android needs a notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#802F1D',
    });
  }

  // Get Expo push token
  try {
    const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID || '149955b4-6781-49d1-ae5d-9b8bca385111';
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    return tokenData.data;
  } catch (error) {
    console.error('Error getting push token:', error);
    return null;
  }
}

/**
 * Save push token to database for the current user
 */
export async function savePushToken(
  userId: string,
  expoPushToken: string
): Promise<boolean> {
  const deviceName = Device.deviceName || undefined;
  const platform = Platform.OS as 'ios' | 'android' | 'web';

  const { error } = await supabase
    .from('push_tokens')
    .upsert(
      {
        user_id: userId,
        expo_push_token: expoPushToken,
        device_name: deviceName,
        platform: platform,
      },
      {
        onConflict: 'user_id,expo_push_token',
      }
    );

  if (error) {
    console.error('Error saving push token:', error);
    return false;
  }

  return true;
}

/**
 * Remove push token from database (for logout)
 */
export async function removePushToken(expoPushToken: string): Promise<boolean> {
  const { error } = await supabase
    .from('push_tokens')
    .delete()
    .eq('expo_push_token', expoPushToken);

  if (error) {
    console.error('Error removing push token:', error);
    return false;
  }

  return true;
}

/**
 * Get all push tokens for a user (for debugging)
 */
export async function getUserPushTokens(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('push_tokens')
    .select('expo_push_token')
    .eq('user_id', userId);

  if (error || !data) {
    console.error('Error fetching push tokens:', error);
    return [];
  }

  return data.map((t) => t.expo_push_token);
}
