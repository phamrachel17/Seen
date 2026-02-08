-- Migration: Add threaded comment replies support
-- Adds parent_id column to comments table for reply threading

-- Add parent_id column for threaded replies
ALTER TABLE public.comments
ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.comments(id) ON DELETE CASCADE;

-- Index for fast lookup of replies by parent
CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON public.comments(parent_id);

-- Update notification type constraint to include 'reply'
ALTER TABLE public.notifications
DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
ADD CONSTRAINT notifications_type_check
CHECK (type IN ('like', 'comment', 'tagged', 'follow', 'reply'));
