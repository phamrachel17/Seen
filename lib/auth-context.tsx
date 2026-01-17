import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { normalizeEmail, isEmail, getEmailByUsername } from './validation';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, username: string, displayName?: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
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
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user, loading, signIn, signUp, signOut }}>
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
