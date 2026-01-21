import { supabase } from '../lib/supabase';
import { ensureContentExists } from '../lib/content';
import { createActivity } from '../lib/activity';

/**
 * Backfill completed activities for existing rankings that don't have them
 *
 * This script:
 * 1. Finds all rankings in the database
 * 2. Checks if each ranking has a corresponding completed activity
 * 3. Creates missing activities to ensure profile stats are accurate
 */
async function backfillRankingActivities() {
  console.log('Starting backfill of ranking activities...\n');

  // Get all rankings with their movie data
  const { data: rankings, error: rankingsError } = await supabase
    .from('rankings')
    .select(`
      id,
      user_id,
      movie_id,
      rank_position,
      created_at,
      movies (*)
    `)
    .order('created_at', { ascending: true });

  if (rankingsError) {
    console.error('Error fetching rankings:', rankingsError);
    return;
  }

  if (!rankings || rankings.length === 0) {
    console.log('No rankings found in database');
    return;
  }

  console.log(`Found ${rankings.length} rankings to process\n`);

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const ranking of rankings) {
    const movie = ranking.movies;

    if (!movie) {
      console.log(`⚠️  Ranking ${ranking.id}: No movie data found, skipping`);
      skipped++;
      continue;
    }

    try {
      // Ensure content exists in content table
      console.log(`Processing ranking ${ranking.id} (${movie.title})...`);
      const content = await ensureContentExists(movie.id, 'movie');

      if (!content) {
        console.error(`❌ Ranking ${ranking.id}: Failed to ensure content for movie ${movie.id}`);
        errors++;
        continue;
      }

      // Check if activity already exists
      const { data: existingActivity } = await supabase
        .from('activity_log')
        .select('id, star_rating')
        .eq('user_id', ranking.user_id)
        .eq('content_id', content.id)
        .eq('status', 'completed')
        .single();

      if (existingActivity) {
        console.log(`✓  Ranking ${ranking.id}: Activity already exists (ID: ${existingActivity.id}), skipping`);
        skipped++;
        continue;
      }

      // Get star rating from activity_log if it exists, otherwise default to 3
      // (We need to find the star rating since rankings table doesn't store it)
      const { data: anyActivity } = await supabase
        .from('activity_log')
        .select('star_rating')
        .eq('user_id', ranking.user_id)
        .eq('content_id', content.id)
        .not('star_rating', 'is', null)
        .single();

      const starRating = anyActivity?.star_rating || 3; // Default to 3 if not found

      // Create the completed activity
      const activityResult = await createActivity({
        userId: ranking.user_id,
        tmdbId: movie.id,
        contentType: 'movie',
        status: 'completed',
        starRating: starRating,
        watchDate: new Date(ranking.created_at), // Use ranking date as watch date
        isPrivate: false,
      });

      if (!activityResult) {
        console.error(`❌ Ranking ${ranking.id}: createActivity returned null`);
        errors++;
        continue;
      }

      console.log(`✅ Ranking ${ranking.id}: Created activity (ID: ${activityResult.id}, stars: ${starRating})`);
      created++;

    } catch (error) {
      console.error(`❌ Ranking ${ranking.id}: Error -`, error);
      errors++;
    }
  }

  console.log('\n─────────────────────────────────');
  console.log('Backfill complete:');
  console.log(`  ✅ Created:  ${created}`);
  console.log(`  ⊝  Skipped:  ${skipped}`);
  console.log(`  ❌ Errors:   ${errors}`);
  console.log('─────────────────────────────────\n');

  if (created > 0) {
    console.log('Profile stats should now update correctly!');
    console.log('Users should refresh their profile to see updated film counts and watch hours.\n');
  }
}

// Run if called directly
if (require.main === module) {
  backfillRankingActivities()
    .then(() => {
      console.log('Script finished successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Script failed:', error);
      process.exit(1);
    });
}

export { backfillRankingActivities };
