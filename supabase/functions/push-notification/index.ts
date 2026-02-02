// Supabase Edge Function: Send push notifications via Expo
// Triggered by database webhook on notifications table INSERT

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

interface NotificationRecord {
  id: string;
  user_id: string;
  actor_id: string;
  type: 'like' | 'comment' | 'tagged' | 'follow';
  review_id?: string;
  comment_id?: string;
  created_at: string;
}

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  record: NotificationRecord;
  schema: 'public';
  old_record: null | NotificationRecord;
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

Deno.serve(async (req) => {
  try {
    const payload: WebhookPayload = await req.json();

    // Only process INSERT events
    if (payload.type !== 'INSERT') {
      return new Response(JSON.stringify({ message: 'Ignored non-INSERT event' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const notification = payload.record;

    // Get push tokens for the notification recipient
    const { data: tokens, error: tokensError } = await supabase
      .from('push_tokens')
      .select('expo_push_token')
      .eq('user_id', notification.user_id);

    if (tokensError || !tokens || tokens.length === 0) {
      console.log('No push tokens found for user:', notification.user_id);
      return new Response(JSON.stringify({ message: 'No tokens found' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get actor info for the notification message
    const { data: actor } = await supabase
      .from('users')
      .select('username, display_name')
      .eq('id', notification.actor_id)
      .single();

    const actorName = actor?.display_name || actor?.username || 'Someone';

    // Get content info if this is a content-related notification
    let contentTitle = '';
    let contentType = '';
    let tmdbId = '';

    if (notification.review_id) {
      // Try activity_log first (new system)
      const { data: activity } = await supabase
        .from('activity_log')
        .select('content:content(tmdb_id, title, content_type)')
        .eq('id', notification.review_id)
        .single();

      if (activity?.content) {
        contentTitle = (activity.content as any).title || '';
        contentType = (activity.content as any).content_type || '';
        tmdbId = String((activity.content as any).tmdb_id || '');
      }
    }

    // Build notification message
    const { title, body } = buildNotificationMessage(
      notification.type,
      actorName,
      contentTitle
    );

    // Build navigation data for deep linking
    const data = buildNavigationData(notification, tmdbId, contentType);

    // Send push notification to all user's devices
    const pushTokens = tokens.map((t) => t.expo_push_token);

    const messages = pushTokens.map((token) => ({
      to: token,
      sound: 'default' as const,
      title,
      body,
      data,
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
    console.log('Push notification result:', JSON.stringify(result));

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error sending push notification:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

function buildNotificationMessage(
  type: string,
  actorName: string,
  contentTitle: string
): { title: string; body: string } {
  switch (type) {
    case 'like':
      return {
        title: 'New Like',
        body: contentTitle
          ? `${actorName} liked your review of ${contentTitle}`
          : `${actorName} liked your review`,
      };
    case 'comment':
      return {
        title: 'New Comment',
        body: contentTitle
          ? `${actorName} commented on your review of ${contentTitle}`
          : `${actorName} commented on your review`,
      };
    case 'tagged':
      return {
        title: 'You were tagged',
        body: contentTitle
          ? `${actorName} tagged you in a review of ${contentTitle}`
          : `${actorName} tagged you in a review`,
      };
    case 'follow':
      return {
        title: 'New Follower',
        body: `${actorName} started following you`,
      };
    default:
      return {
        title: 'Seen',
        body: 'You have a new notification',
      };
  }
}

function buildNavigationData(
  notification: NotificationRecord,
  tmdbId: string,
  contentType: string
): Record<string, string> {
  switch (notification.type) {
    case 'like':
    case 'comment':
    case 'tagged':
      return {
        type: notification.type,
        targetId: tmdbId,
        contentType: contentType,
        notificationId: notification.id,
      };
    case 'follow':
      return {
        type: 'follow',
        targetId: notification.actor_id,
        notificationId: notification.id,
      };
    default:
      return {
        type: notification.type,
        notificationId: notification.id,
      };
  }
}
