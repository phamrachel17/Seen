// Supabase Edge Function: Send broadcast push notifications to all users
// Use this to announce updates, new features, etc.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

interface BroadcastRequest {
  title: string;
  body: string;
  data?: Record<string, string>;
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

Deno.serve(async (req) => {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Verify the caller is authenticated
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Verify JWT and get the calling user
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user: caller }, error: authError } = await userClient.auth.getUser();
  if (authError || !caller) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Check caller is an admin (match against ADMIN_USER_IDS env var, comma-separated)
  const adminIds = (Deno.env.get('ADMIN_USER_IDS') || '').split(',').map(id => id.trim());
  if (!adminIds.includes(caller.id)) {
    return new Response(JSON.stringify({ error: 'Forbidden: admin access required' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { title, body, data }: BroadcastRequest = await req.json();

    if (!title || !body) {
      return new Response(JSON.stringify({ error: 'Title and body are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get ALL push tokens from the database
    const { data: tokens, error: tokensError } = await supabase
      .from('push_tokens')
      .select('expo_push_token');

    if (tokensError) {
      console.error('Error fetching tokens:', tokensError);
      return new Response(JSON.stringify({ error: 'Failed to fetch tokens' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ message: 'No push tokens found', sent: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log(`Sending broadcast to ${tokens.length} devices`);

    // Build messages for all tokens
    const pushTokens = tokens.map((t) => t.expo_push_token);

    // Expo Push API accepts up to 100 messages per request
    // Batch them if needed
    const BATCH_SIZE = 100;
    const batches: string[][] = [];

    for (let i = 0; i < pushTokens.length; i += BATCH_SIZE) {
      batches.push(pushTokens.slice(i, i + BATCH_SIZE));
    }

    let totalSent = 0;
    const results: any[] = [];

    for (const batch of batches) {
      const messages = batch.map((token) => ({
        to: token,
        sound: 'default' as const,
        title,
        body,
        data: data || { type: 'broadcast' },
      }));

      // Send to Expo Push API
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip, deflate',
        },
        body: JSON.stringify(messages),
      });

      const result = await response.json();
      results.push(result);
      totalSent += batch.length;

      console.log(`Batch sent: ${batch.length} messages`);
    }

    console.log(`Broadcast complete: ${totalSent} total messages sent`);

    return new Response(JSON.stringify({
      message: 'Broadcast sent successfully',
      sent: totalSent,
      batches: batches.length,
      results
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error sending broadcast:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
