-- Migration: Fix movies table RLS policies
-- Run this in Supabase SQL Editor to allow authenticated users to cache movies

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Service role can insert movies" ON public.movies;
DROP POLICY IF EXISTS "Service role can update movies" ON public.movies;

-- Create new policies that allow authenticated users
CREATE POLICY "Authenticated users can insert movies" ON public.movies
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update movies" ON public.movies
  FOR UPDATE USING (auth.role() = 'authenticated');

-- Verify policies are in place
-- You can run this to check:
-- SELECT * FROM pg_policies WHERE tablename = 'movies';
