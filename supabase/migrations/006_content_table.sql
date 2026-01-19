-- Migration: Create unified content table for movies and TV shows

-- Create content table
CREATE TABLE IF NOT EXISTS public.content (
  id SERIAL PRIMARY KEY,
  tmdb_id INTEGER NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('movie', 'tv')),
  title TEXT NOT NULL,
  poster_url TEXT,
  backdrop_url TEXT,
  release_year INTEGER,
  -- Movie-specific fields
  runtime_minutes INTEGER,
  director TEXT,
  -- TV-specific fields
  total_seasons INTEGER,
  total_episodes INTEGER,
  -- Common fields
  genres TEXT[],
  synopsis TEXT,
  popularity_score REAL,
  collection_id INTEGER,
  collection_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- Ensure unique combination of tmdb_id and content_type
  UNIQUE(tmdb_id, content_type)
);

-- Enable RLS
ALTER TABLE public.content ENABLE ROW LEVEL SECURITY;

-- Content is publicly readable (for search, browsing)
CREATE POLICY "Content is viewable by everyone"
  ON public.content FOR SELECT
  USING (true);

-- Only authenticated users can insert content (when logging activity)
CREATE POLICY "Authenticated users can insert content"
  ON public.content FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_content_tmdb_id ON public.content(tmdb_id);
CREATE INDEX IF NOT EXISTS idx_content_type ON public.content(content_type);
CREATE INDEX IF NOT EXISTS idx_content_title ON public.content(title);

COMMENT ON TABLE public.content IS 'Unified table for movies and TV shows metadata';
COMMENT ON COLUMN public.content.content_type IS 'Type of content: movie or tv';
COMMENT ON COLUMN public.content.tmdb_id IS 'The Movie Database ID';
