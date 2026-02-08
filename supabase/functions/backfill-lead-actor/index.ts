// Supabase Edge Function: Backfill lead_actor for existing content
// Run once to populate lead_actor from TMDB cast data

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY')!;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

interface ContentRow {
  id: number;
  tmdb_id: number;
  content_type: 'movie' | 'tv';
  title: string;
}

interface TMDBCreditsResponse {
  cast?: Array<{ name: string; order: number }>;
}

async function getLeadActor(tmdbId: number, contentType: 'movie' | 'tv'): Promise<string | null> {
  try {
    const endpoint = contentType === 'movie'
      ? `${TMDB_BASE_URL}/movie/${tmdbId}/credits`
      : `${TMDB_BASE_URL}/tv/${tmdbId}/credits`;

    const response = await fetch(`${endpoint}?api_key=${TMDB_API_KEY}`);

    if (!response.ok) {
      console.error(`TMDB API error for ${contentType} ${tmdbId}: ${response.status}`);
      return null;
    }

    const data: TMDBCreditsResponse = await response.json();

    // Get first billed cast member (order 0)
    if (data.cast && data.cast.length > 0) {
      // Sort by order to ensure we get the lead
      const sorted = data.cast.sort((a, b) => a.order - b.order);
      return sorted[0].name;
    }

    return null;
  } catch (error) {
    console.error(`Error fetching credits for ${contentType} ${tmdbId}:`, error);
    return null;
  }
}

Deno.serve(async (req) => {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // Parse optional batch size from request body
    const body = await req.json().catch(() => ({}));
    const batchSize = body.batchSize || 50;

    // Get content without lead_actor
    const { data: content, error: fetchError } = await supabase
      .from('content')
      .select('id, tmdb_id, content_type, title')
      .is('lead_actor', null)
      .limit(batchSize);

    if (fetchError) {
      throw new Error(`Failed to fetch content: ${fetchError.message}`);
    }

    if (!content || content.length === 0) {
      return new Response(JSON.stringify({
        message: 'No content to backfill',
        updated: 0,
        remaining: 0
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const results: Array<{ id: number; title: string; lead_actor: string | null; success: boolean }> = [];

    for (const item of content as ContentRow[]) {
      const leadActor = await getLeadActor(item.tmdb_id, item.content_type);

      if (leadActor) {
        const { error: updateError } = await supabase
          .from('content')
          .update({ lead_actor: leadActor })
          .eq('id', item.id);

        results.push({
          id: item.id,
          title: item.title,
          lead_actor: leadActor,
          success: !updateError
        });
      } else {
        // Mark as processed with empty string to avoid re-processing
        await supabase
          .from('content')
          .update({ lead_actor: '' })
          .eq('id', item.id);

        results.push({
          id: item.id,
          title: item.title,
          lead_actor: null,
          success: true
        });
      }

      // Small delay to avoid TMDB rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Count remaining
    const { count } = await supabase
      .from('content')
      .select('id', { count: 'exact', head: true })
      .is('lead_actor', null);

    return new Response(JSON.stringify({
      message: `Backfilled ${results.length} items`,
      updated: results.filter(r => r.lead_actor).length,
      remaining: count || 0,
      results
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Backfill error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
