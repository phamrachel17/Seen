import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { usePostHog } from 'posthog-react-native';
import { supabase } from './supabase';
import { normalizeEmail, isEmail, getEmailByUsername } from './validation';
import { cache } from './cache';
import {
  registerForPushNotifications,
  savePushToken,
  removePushToken,
} from './push-notifications';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, username: string, displayName?: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const currentPushToken = useRef<string | null>(null);
  const posthog = usePostHog();

  // Setup push notifications for a user
  const setupPushNotifications = async (userId: string) => {
    try {
      const token = await registerForPushNotifications();
      if (token) {
        await savePushToken(userId, token);
        currentPushToken.current = token;
      }
    } catch (error) {
      console.error('Error setting up push notifications:', error);
    }
  };

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        // Invalid refresh token - clear the session
        supabase.auth.signOut();
        setSession(null);
        setUser(null);
      } else {
        setSession(session);
        setUser(session?.user ?? null);
        // Identify existing user in PostHog
        if (session?.user) {
          posthog?.identify(session.user.id, {
            email: session.user.email,
          });
        }
      }
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);

      // Setup push notifications and identify user in PostHog when they sign in
      if (event === 'SIGNED_IN' && session?.user) {
        setupPushNotifications(session.user.id);
        posthog?.identify(session.user.id, {
          email: session.user.email,
        });
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (emailOrUsername: string, password: string) => {
    let email: string;

    // Check if input is email or username
    if (isEmail(emailOrUsername)) {
      // Normalize email to match how it was stored during sign-up
      email = normalizeEmail(emailOrUsername);
    } else {
      // Look up email by username
      const foundEmail = await getEmailByUsername(emailOrUsername);
      if (!foundEmail) {
        return { error: new Error('User not found') };
      }
      email = foundEmail;
    }

    // Clear cache before sign-in to prevent data leakage between accounts
    cache.clear();

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string, username: string, displayName?: string) => {
    // Normalize email to prevent Gmail duplicates (dots, aliases)
    const normalizedEmail = normalizeEmail(email);
    const trimmedUsername = username.trim();
    const trimmedDisplayName = displayName?.trim();

    const { error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        emailRedirectTo: 'seen://auth/confirm',
        data: {
          username: trimmedUsername,
          display_name: trimmedDisplayName || null,
        },
      },
    });

    // The database trigger handle_new_user() automatically creates
    // the user profile in public.users table. Do NOT manually insert.

    return { error: error as Error | null };
  };

  const signOut = async () => {
    // Remove push token before signing out
    if (currentPushToken.current) {
      await removePushToken(currentPushToken.current);
      currentPushToken.current = null;
    }
    cache.clear(); // Clear all cached data on logout
    posthog?.reset(); // Reset PostHog identity on logout
    await supabase.auth.signOut();
  };

  const deleteAccount = async (): Promise<{ error: Error | null }> => {
    try {
      const { error } = await supabase.rpc('delete_user_account');

      if (error) {
        return { error: new Error(error.message) };
      }

      // Clear all cached data after successful deletion
      cache.clear();

      // Clear local session state after successful deletion
      setSession(null);
      setUser(null);

      return { error: null };
    } catch (err) {
      return { error: err as Error };
    }
  };

  return (
    <AuthContext.Provider value={{ session, user, loading, signIn, signUp, signOut, deleteAccount }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
