-- Migration: Enable push notification trigger
-- Calls the push-notification Edge Function when a notification is inserted

-- Enable pg_net extension for async HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Function to call the push-notification Edge Function
CREATE OR REPLACE FUNCTION public.handle_new_notification()
RETURNS TRIGGER AS $$
DECLARE
  payload JSONB;
BEGIN
  -- Build the webhook payload matching the expected format
  payload := jsonb_build_object(
    'type', 'INSERT',
    'table', 'notifications',
    'schema', 'public',
    'record', jsonb_build_object(
      'id', NEW.id,
      'user_id', NEW.user_id,
      'actor_id', NEW.actor_id,
      'type', NEW.type,
      'review_id', NEW.review_id,
      'comment_id', NEW.comment_id,
      'created_at', NEW.created_at
    ),
    'old_record', NULL
  );

  -- Make async HTTP request to Edge Function (verify_jwt is false, so no auth needed)
  PERFORM net.http_post(
    url := 'https://hsuydsuebluhycdeqghv.supabase.co/functions/v1/push-notification',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := payload
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on notifications table
DROP TRIGGER IF EXISTS on_notification_created ON public.notifications;
CREATE TRIGGER on_notification_created
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_notification();
