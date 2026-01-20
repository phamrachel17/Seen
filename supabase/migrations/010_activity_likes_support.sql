-- Migration: Add activity likes/comments support
-- The likes and comments tables currently have FK constraints on review_id
-- This migration allows likes/comments on activities (which may not have a corresponding review)

-- Option 1: Add activity_id column to likes table (keeping review_id for backward compatibility)
-- First, check if activity_id column already exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'likes'
    AND column_name = 'activity_id'
  ) THEN
    ALTER TABLE public.likes ADD COLUMN activity_id UUID;
  END IF;
END $$;

-- Drop the FK constraint on review_id if it exists (allows null or non-existent reviews)
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT tc.constraint_name INTO constraint_name
  FROM information_schema.table_constraints tc
  WHERE tc.table_schema = 'public'
    AND tc.table_name = 'likes'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND EXISTS (
      SELECT 1 FROM information_schema.key_column_usage kcu
      WHERE kcu.constraint_name = tc.constraint_name
        AND kcu.column_name = 'review_id'
    );

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.likes DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

-- Do the same for comments table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'comments'
    AND column_name = 'activity_id'
  ) THEN
    ALTER TABLE public.comments ADD COLUMN activity_id UUID;
  END IF;
END $$;

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT tc.constraint_name INTO constraint_name
  FROM information_schema.table_constraints tc
  WHERE tc.table_schema = 'public'
    AND tc.table_name = 'comments'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND EXISTS (
      SELECT 1 FROM information_schema.key_column_usage kcu
      WHERE kcu.constraint_name = tc.constraint_name
        AND kcu.column_name = 'review_id'
    );

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.comments DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

-- Do the same for notifications table
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT tc.constraint_name INTO constraint_name
  FROM information_schema.table_constraints tc
  WHERE tc.table_schema = 'public'
    AND tc.table_name = 'notifications'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND EXISTS (
      SELECT 1 FROM information_schema.key_column_usage kcu
      WHERE kcu.constraint_name = tc.constraint_name
        AND kcu.column_name = 'review_id'
    );

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.notifications DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

-- Create indexes for activity_id columns
CREATE INDEX IF NOT EXISTS idx_likes_activity_id ON public.likes(activity_id);
CREATE INDEX IF NOT EXISTS idx_comments_activity_id ON public.comments(activity_id);

-- Note: After running this migration, likes/comments can be made using either:
-- - review_id (for backward compatibility with old reviews)
-- - activity_id (for new activity-based system)
-- The application code currently uses review_id for both, which works since
-- migrated activities share the same ID as their original reviews.
