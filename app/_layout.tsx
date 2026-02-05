import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts } from 'expo-font';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import {
  LibreBaskerville_400Regular,
  LibreBaskerville_700Bold,
  LibreBaskerville_400Regular_Italic,
} from '@expo-google-fonts/libre-baskerville';
import {
  NanumMyeongjo_400Regular,
  NanumMyeongjo_700Bold,
  NanumMyeongjo_800ExtraBold,
} from '@expo-google-fonts/nanum-myeongjo';
import * as SplashScreen from 'expo-splash-screen';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import * as Sentry from '@sentry/react-native';
import { PostHogProvider } from 'posthog-react-native';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { CacheProvider } from '@/lib/cache-context';
import { Colors } from '@/constants/theme';
import 'react-native-reanimated';

// Initialize Sentry for crash reporting
Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1.0,
  _experiments: {
    profilesSampleRate: 1.0,
  },
});

// Prevent splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      router.replace('/(auth)');
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [session, loading, segments, router]);

  // Handle deep links for email confirmation
  useEffect(() => {
    const handleDeepLink = (event: { url: string }) => {
      try {
        const url = event.url;
        if (url.includes('auth/confirm') || url.includes('token_hash')) {
          const params = Linking.parse(url);
          const tokenHash = params.queryParams?.token_hash;
          const type = params.queryParams?.type;
          // Validate token_hash is a string (not array or undefined)
          if (typeof tokenHash === 'string' && tokenHash.length > 0) {
            router.push({
              pathname: '/auth-confirm',
              params: {
                token_hash: tokenHash,
                type: typeof type === 'string' ? type : 'signup'
              },
            });
          }
        }
      } catch (error) {
        // Silently handle malformed deep links
        console.warn('Failed to parse deep link:', error);
      }
    };

    // Handle deep links when app is already open
    const subscription = Linking.addEventListener('url', handleDeepLink);

    // Handle deep link that opened the app
    Linking.getInitialURL()
      .then((url) => {
        if (url) handleDeepLink({ url });
      })
      .catch((error) => {
        console.warn('Failed to get initial URL:', error);
      });

    return () => subscription.remove();
  }, [router]);

  // Handle push notification taps
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data;

        // Navigate based on notification type
        if (data?.type && data?.targetId) {
          handleNotificationNavigation(
            data.type as string,
            data.targetId as string,
            data.contentType as string | undefined
          );
        } else {
          // Default: navigate to notifications screen
          router.push('/notifications');
        }
      }
    );

    return () => subscription.remove();
  }, [router]);

  // Navigation helper for notification taps
  const handleNotificationNavigation = (
    type: string,
    targetId: string,
    contentType?: string
  ) => {
    switch (type) {
      case 'like':
      case 'comment':
      case 'tagged':
        // Navigate to title detail page
        if (targetId && contentType) {
          router.push(`/title/${targetId}?type=${contentType}` as any);
        }
        break;
      case 'follow':
        // Navigate to user profile
        if (targetId) {
          router.push(`/user/${targetId}`);
        }
        break;
      default:
        // Navigate to notifications screen
        router.push('/notifications');
    }
  };

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.background },
          animation: 'slide_from_right',
          animationDuration: 200,
        }}
      >
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="movie/[id]"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="review/[movieId]"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
            animationDuration: 250,
          }}
        />
        <Stack.Screen
          name="rank/[movieId]"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
            animationDuration: 250,
          }}
        />
        <Stack.Screen
          name="edit-profile"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
            animationDuration: 250,
          }}
        />
        <Stack.Screen
          name="follow-list"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
            animationDuration: 250,
          }}
        />
        <Stack.Screen
          name="user/[id]"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="friend-picker"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
            animationDuration: 250,
          }}
        />
        <Stack.Screen
          name="review-detail/[id]"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="notifications"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="auth-confirm"
          options={{
            presentation: 'card',
            animation: 'fade',
          }}
        />
        <Stack.Screen
          name="account"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="list/[id]"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="create-list"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
            animationDuration: 250,
          }}
        />
        <Stack.Screen
          name="user-activity/[userId]"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
      </Stack>
      <StatusBar style="dark" />
    </>
  );
}

export default Sentry.wrap(function RootLayout() {
  const [fontsLoaded] = useFonts({
    LibreBaskerville_400Regular,
    LibreBaskerville_700Bold,
    LibreBaskerville_400Regular_Italic,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    NanumMyeongjo_400Regular,
    NanumMyeongjo_700Bold,
    NanumMyeongjo_800ExtraBold,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <PostHogProvider
      apiKey={process.env.EXPO_PUBLIC_POSTHOG_API_KEY!}
      options={{
        host: process.env.EXPO_PUBLIC_POSTHOG_HOST,
        enableSessionReplay: true,
      }}
      autocapture
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <CacheProvider>
          <AuthProvider>
            <RootLayoutNav />
          </AuthProvider>
        </CacheProvider>
      </GestureHandlerRootView>
    </PostHogProvider>
  );
});