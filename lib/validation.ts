import { supabase } from './supabase';

/**
 * Normalize email addresses to prevent duplicates via Gmail tricks
 * Handles:
 * - Dots in username (john.doe@gmail.com = johndoe@gmail.com)
 * - Plus aliases (john+alias@gmail.com = john@gmail.com)
 * - @googlemail.com variant
 */
export function normalizeEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const [username, domain] = trimmed.split('@');

  if (!domain) return trimmed;

  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    let normalized = username;

    // Remove +alias suffix FIRST (before removing dots)
    const plusIndex = normalized.indexOf('+');
    if (plusIndex !== -1) {
      normalized = normalized.substring(0, plusIndex);
    }

    // Remove dots from username
    normalized = normalized.replace(/\./g, '');

    // Always normalize to @gmail.com (not @googlemail.com)
    return `${normalized}@gmail.com`;
  }

  return trimmed;
}

/**
 * Check if a username is available (case-insensitive)
 * Returns true if username is available, false if taken
 */
export async function checkUsernameAvailable(username: string): Promise<boolean> {
  const trimmed = username.trim();

  const { data } = await supabase
    .from('users')
    .select('id')
    .ilike('username', trimmed)
    .maybeSingle();

  return !data;
}

/**
 * Check if an email is available (with Gmail normalization)
 * Returns true if email is available, false if taken
 */
export async function checkEmailAvailable(email: string): Promise<boolean> {
  const normalized = normalizeEmail(email);

  const { data } = await supabase
    .from('users')
    .select('id')
    .eq('email', normalized)
    .maybeSingle();

  return !data;
}

/**
 * Get email address by username (case-insensitive)
 * Returns the email if found, null if user doesn't exist
 */
export async function getEmailByUsername(username: string): Promise<string | null> {
  const trimmed = username.trim();

  const { data } = await supabase
    .from('users')
    .select('email')
    .ilike('username', trimmed)
    .maybeSingle();

  return data?.email || null;
}

/**
 * Check if input looks like an email address
 */
export function isEmail(input: string): boolean {
  return input.includes('@');
}
