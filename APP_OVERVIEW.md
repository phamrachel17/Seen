# Seen — App Overview

Seen is a social movie discovery and ranking app for cinephiles. It lets users track what they've watched, rate and review films, build personalized rankings, and discover new content through friends' activity.

---

## Core Purpose

**Primary Value Proposition**: Help movie lovers organize their viewing history, express opinions through nuanced rankings (not just ratings), and discover films through trusted social connections.

**Key Differentiator**: The ranking system goes beyond simple star ratings—users build ordered lists where every film has a definitive position relative to others in the same star tier.

---

## Key User Flows

### 1. Authentication Flow
```
Landing → Sign Up (email/password) → Email Verification → Sign In → Home Feed
                                           ↓
                                   Verify Email Screen
                                   (resend available)
```

### 2. Discovery Flow
```
Discover Tab → Browse Categories → Movie/Show Detail → Watch/Rate/Rank/Review
                    ↓
              Search → Results → Detail Page
```

### 3. Rating & Ranking Flow
```
Movie Detail → "Rate" → Star Selection (1-5) → Pairwise Comparisons → Ranked Position Assigned
                                                      ↓
                                              Rankings Tab → Drag to Reorder
```

### 4. Social Flow
```
Activity Feed → Friend's Activity → View Review/Rating → Go to Movie or User Profile
      ↓
Follow/Unfollow → Feed Updates
```

---

## Feature Inventory

### Authentication & Account
| Feature | Description |
|---------|-------------|
| Email Sign-Up | Create account with email, password, username, display name |
| Email Verification | Supabase-powered email confirmation with deep linking |
| Sign In | Login via email or username |
| Profile Management | Edit avatar, bio, display name |
| Delete Account | Full account deletion via RPC |

### Movie & TV Discovery
| Feature | Description |
|---------|-------------|
| TMDB Integration | Full movie/TV database with posters, metadata, cast/crew |
| Search | Search movies, TV shows, and people |
| Movie Detail | Overview, cast, crew, trailers, similar titles |
| TV Show Detail | Seasons, episodes, progress tracking |
| Person Pages | Filmography, known-for titles |

### Rating & Reviewing
| Feature | Description |
|---------|-------------|
| Star Rating | 1-5 star rating system |
| Written Reviews | Optional text review with rating |
| Review Visibility | Reviews appear in activity feed |
| Edit/Delete | Modify or remove reviews |

### Ranking System
| Feature | Description |
|---------|-------------|
| Star-Tier Rankings | Separate ranked lists for each star level (5★, 4★, etc.) |
| Pairwise Comparisons | Binary search to find exact position |
| Drag-to-Reorder | Manual repositioning within tier |
| Auto-Promotion/Demotion | Score recalculates on position change |
| Display Scores | Decimal scores (1.0-10.0) derived from position |

### Social Features
| Feature | Description |
|---------|-------------|
| Activity Feed | See friends' watches, ratings, reviews |
| Follow System | Follow/unfollow users |
| User Profiles | View others' stats, rankings, activity |
| Friend Picker | Select friends for sharing/recommendations |
| Notifications | Follows, likes, comments |

### Lists & Organization
| Feature | Description |
|---------|-------------|
| Watchlist/Bookmarks | Save movies to watch later |
| Custom Lists | Create themed collections |
| Currently Watching | Track TV show progress |

### Discovery Features
| Feature | Description |
|---------|-------------|
| Pick for Me | AI-powered random suggestion |
| Spotlight | Featured/trending content |
| Friends Watching | See what friends are currently viewing |
| Horizontal Carousels | Browse by category |

---

## Ranking System — Deep Technical Specification

### Data Model

```sql
CREATE TABLE rankings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content_id UUID NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL CHECK (content_type IN ('movie', 'tv')),
  star_rating INTEGER NOT NULL CHECK (star_rating BETWEEN 1 AND 5),
  rank_position INTEGER NOT NULL,
  display_score DECIMAL(3,1) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT rankings_user_content_unique UNIQUE (user_id, content_id),
  CONSTRAINT rankings_user_content_type_position_key
    UNIQUE (user_id, content_type, rank_position) DEFERRABLE INITIALLY IMMEDIATE
);
```

**Key Constraints**:
- Each user can only rank a piece of content once
- Position must be unique within (user, content_type)
- Position constraint is deferrable for batch reordering operations

### Star Rating → Score Band Mapping

| Star Rating | Score Range | Band Width |
|-------------|-------------|------------|
| 5★ | 9.5 – 10.0 | 0.5 |
| 4★ | 8.0 – 9.4 | 1.4 |
| 3★ | 6.0 – 7.9 | 1.9 |
| 2★ | 4.0 – 5.9 | 1.9 |
| 1★ | 1.0 – 3.9 | 2.9 |

**Score Calculation Formula**:
```typescript
function calculateDisplayScore(
  starRating: number,
  position: number,
  totalInTier: number
): number {
  const bands = {
    5: { min: 9.5, max: 10.0 },
    4: { min: 8.0, max: 9.4 },
    3: { min: 6.0, max: 7.9 },
    2: { min: 4.0, max: 5.9 },
    1: { min: 1.0, max: 3.9 },
  };

  const { min, max } = bands[starRating];

  if (totalInTier === 1) return max;

  // Position 1 = highest score, position N = lowest score
  const range = max - min;
  const step = range / (totalInTier - 1);
  return max - (position - 1) * step;
}
```

### Pairwise Comparison Logic

When a user rates a movie, the system uses **binary insertion search** to find its position:

```typescript
async function findRankPosition(
  userId: string,
  contentType: string,
  starRating: number,
  newContentId: string
): Promise<number> {
  // Get all items in the same star tier
  const tierItems = await getRankingsInTier(userId, contentType, starRating);

  if (tierItems.length === 0) return 1;

  // Binary search through comparisons
  let low = 0;
  let high = tierItems.length;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const comparison = await askUserComparison(newContentId, tierItems[mid].contentId);

    if (comparison === 'better') {
      high = mid; // New item ranks higher (lower position number)
    } else {
      low = mid + 1; // New item ranks lower (higher position number)
    }
  }

  return low + 1; // 1-indexed position
}
```

**Comparison Selection Strategy**:
The system selects comparison candidates based on similarity:
- Genre overlap
- Release year proximity
- Director/cast overlap
- User's existing scores for similar content

### Reordering Logic

When a user drags an item to a new position:

```typescript
async function reorderRanking(
  userId: string,
  contentType: string,
  rankingId: string,
  fromPosition: number,
  toPosition: number
): Promise<void> {
  // Determine star tier changes
  const ranking = await getRanking(rankingId);
  const targetNeighbors = await getNeighborsAtPosition(userId, contentType, toPosition);

  // Check if crossing star tier boundary
  const newStarRating = determineStarTier(targetNeighbors);

  if (newStarRating !== ranking.star_rating) {
    // Promote or demote to new tier
    ranking.star_rating = newStarRating;
  }

  // Shift other items to make room
  await shiftRankingsDown(userId, contentType, toPosition);

  // Update the moved item
  await updateRankingPosition(rankingId, toPosition);

  // Recalculate all display scores in affected tiers
  await recalculateDisplayScores(userId, contentType);
}
```

**Batch Reordering RPC**:
```sql
CREATE OR REPLACE FUNCTION public.reorder_rankings_batch(
  p_user_id uuid,
  p_content_type text,
  p_rankings jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  -- Defer unique constraint to allow position swaps
  SET CONSTRAINTS public.rankings_user_content_type_position_key DEFERRED;

  -- Update all positions in a single operation
  UPDATE public.rankings r
  SET
    rank_position = (item->>'rank_position')::INT,
    display_score = (item->>'display_score')::DECIMAL,
    updated_at = NOW()
  FROM jsonb_array_elements(p_rankings) AS item
  WHERE r.id = (item->>'id')::UUID
    AND r.user_id = p_user_id
    AND r.content_type = p_content_type;
END;
$function$;
```

### Edge Case Handling

| Edge Case | Handling |
|-----------|----------|
| First item in tier | Assign max score for that tier |
| Only item in tier | Assign max score for that tier |
| Move across tier boundary | Update star_rating, recalculate score in new tier |
| Delete ranked item | Shift all lower items up, recalculate scores |
| Rate same content twice | Update existing ranking, potentially reposition |
| Concurrent edits | Deferrable constraints prevent position conflicts |

### Neighbor-Aware Score Calculation

When repositioning, the display score is interpolated based on neighbors:

```typescript
function calculateNeighborAwareScore(
  position: number,
  upperNeighbor: { position: number; score: number } | null,
  lowerNeighbor: { position: number; score: number } | null,
  tierBounds: { min: number; max: number }
): number {
  if (!upperNeighbor && !lowerNeighbor) {
    return tierBounds.max;
  }

  if (!upperNeighbor) {
    // At top of list
    return Math.min(tierBounds.max, lowerNeighbor.score + 0.1);
  }

  if (!lowerNeighbor) {
    // At bottom of list
    return Math.max(tierBounds.min, upperNeighbor.score - 0.1);
  }

  // Between two items - interpolate
  return (upperNeighbor.score + lowerNeighbor.score) / 2;
}
```

### Database-Level Logic

**Shift Rankings RPC** (used when inserting at a position):
```sql
CREATE OR REPLACE FUNCTION public.shift_rankings_down(
  p_user_id uuid,
  p_content_type text,
  p_from_position integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  r RECORD;
BEGIN
  -- Iterate in reverse order to avoid constraint violations
  FOR r IN
    SELECT id FROM public.rankings
    WHERE user_id = p_user_id
      AND content_type = p_content_type
      AND rank_position >= p_from_position
    ORDER BY rank_position DESC
  LOOP
    UPDATE public.rankings
    SET rank_position = rank_position + 1, updated_at = NOW()
    WHERE id = r.id;
  END LOOP;
END;
$function$;
```

**Performance Indexes**:
```sql
-- Fast lookup of user's rankings by content type
CREATE INDEX idx_rankings_user_content_type
  ON rankings(user_id, content_type);

-- Fast position-based queries
CREATE INDEX idx_rankings_user_type_position
  ON rankings(user_id, content_type, rank_position);

-- Fast lookup by star tier
CREATE INDEX idx_rankings_user_type_star
  ON rankings(user_id, content_type, star_rating);
```

---

## Database Schema Overview

### Core Tables

| Table | Purpose |
|-------|---------|
| `users` | User profiles (synced from auth.users) |
| `content` | Unified movies & TV shows (cached from TMDB) |
| `rankings` | User's ranked content with scores |
| `activity_log` | All user activity (watches, ratings, reviews) |
| `follows` | User follow relationships |
| `notifications` | In-app notifications |
| `user_lists` | Custom user-created lists |
| `user_list_items` | Items in custom lists |
| `bookmarks` | Watchlist/saved items |

### Activity Log Types

```sql
CHECK (activity_type IN (
  'watch',           -- Marked as watched
  'rewatch',         -- Watched again
  'rating',          -- Gave star rating
  'review',          -- Wrote review
  'rank',            -- Added to rankings
  'list_add',        -- Added to custom list
  'bookmark'         -- Saved to watchlist
))
```

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React Native (Expo) |
| Navigation | Expo Router |
| Backend | Supabase (PostgreSQL + Auth + Storage) |
| External API | TMDB (movie/TV metadata) |
| State | React Context + Custom hooks |
| Styling | React Native StyleSheet |
| Analytics | PostHog |
| Error Tracking | Sentry |

---

## File Structure

```
Seen/
├── app/                    # Expo Router screens
│   ├── (auth)/            # Auth screens (sign-in, sign-up, verify)
│   ├── (tabs)/            # Main tab screens (home, discover, profile)
│   ├── movie/[id].tsx     # Movie detail
│   ├── rank/[movieId].tsx # Ranking flow
│   └── ...
├── components/            # Reusable UI components
│   ├── ui/               # Base UI elements
│   └── ...               # Feature components
├── lib/                   # Core logic
│   ├── auth-context.tsx  # Auth state
│   ├── ranking.ts        # Ranking algorithms
│   ├── tmdb.ts           # TMDB API client
│   ├── social.ts         # Follow/activity logic
│   └── ...
├── constants/             # Theme, config
├── types/                 # TypeScript definitions
└── supabase/
    └── migrations/        # Database migrations
```
