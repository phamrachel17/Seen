# Seen — App Overview

Seen is a social movie and TV discovery app for cinephiles. It lets users track what they've watched, rate and review films with half-star precision, build personalized rankings through pairwise comparisons, and discover new content through friends' activity.

---

## Core Purpose

**Primary Value Proposition**: Help movie lovers organize their viewing history, express opinions through nuanced rankings (not just ratings), and discover films through trusted social connections.

**Key Differentiator**: The ranking system goes beyond simple star ratings — users build ordered lists where every title has a definitive position relative to others, with display scores (1.0–10.0) derived from position.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React Native (Expo, New Architecture) |
| Navigation | Expo Router (file-based, typed routes) |
| Backend | Supabase (PostgreSQL + Auth + Storage + Edge Functions) |
| Content API | TMDB (movie/TV metadata, cast, trailers) |
| Ratings API | OMDb (IMDb, Rotten Tomatoes, Metascore) |
| State | React Context + custom hooks + in-memory cache |
| Styling | React Native StyleSheet |
| Analytics | PostHog (screen tracking, DAU, autocapture) |
| Error Tracking | Sentry |
| Notifications | Expo Notifications + Supabase Edge Functions |

---

## Key User Flows

### Authentication
```
Landing → Sign Up (email/password/username) → Email Verification → Sign In → Home Feed
```

### Discovery & Rating
```
Discover Tab → Search/Browse → Title Detail → Rate (0.5–5 stars) → Pairwise Comparisons → Ranked Position
```

### TV Show Progress
```
Title Detail → Log Progress (season/episode) → Continue Watching → Complete → Rate & Rank
```

### Social
```
Activity Feed → Friend's Activity → Like/Comment/Reply → View Title or User Profile
```

### Pick for Me
```
Discover Tab → Pick for Me → Set Filters (genre/mood/time) → Get Suggestion → Accept/Skip/Save
```

---

## Feature Inventory

### Authentication & Account
| Feature | Description |
|---------|-------------|
| Email Sign-Up | Create account with email, password, username, display name |
| Email Verification | Supabase-powered confirmation with deep linking |
| Sign In | Login via email or username |
| Profile Management | Edit avatar, bio, display name, username |
| Delete Account | Full account deletion via SECURITY DEFINER RPC |

### Content Discovery
| Feature | Description |
|---------|-------------|
| TMDB Integration | Full movie/TV database with posters, metadata, cast/crew |
| OMDb Ratings | IMDb, Rotten Tomatoes, and Metascore display |
| Search | Search movies, TV shows, and people (adult content filtered) |
| Title Detail | Overview, cast/crew tabs, trailers, similar titles, friends' activity |
| Person Pages | Bio, filmography, known-for titles |
| Pick for Me | Recommendation engine with genre, mood, and time filters |
| Spotlight | Featured trending content carousel |
| Genre/Person Filters | Filter discover page by genre or cast/crew member |

### Rating & Reviewing
| Feature | Description |
|---------|-------------|
| Half-Star Ratings | 0.5–5 star rating with 0.5 increments |
| Written Reviews | Optional text review with privacy toggle |
| Watch Date Tracking | Record when you watched (supports multiple dates for rewatches) |
| Friend Tagging | Tag friends in reviews |
| Season Ratings | Per-season star ratings for TV shows with optional mini-reviews |

### Ranking System
| Feature | Description |
|---------|-------------|
| Pairwise Comparisons | Binary search to find exact position among same-tier titles |
| Display Scores | 1.0–10.0 scores derived from position within star tier |
| Drag-to-Reorder | Manual repositioning with haptic feedback |
| Separate Rankings | Independent movie and TV show ranked lists |
| Auto Watchlist Removal | Titles removed from watchlist after ranking |

### Social Features
| Feature | Description |
|---------|-------------|
| Activity Feed | See followed users' watches, ratings, reviews |
| Follow System | Instant follow/unfollow (no approval needed) |
| Likes & Comments | Like activities, comment with threaded replies |
| Comment Likes | Like individual comments |
| User Profiles | View others' stats, rankings, taste insights |
| Notifications | Likes, comments, replies, tags, follows with push support |
| Leaderboard | Top rankers by count with trophy icons |

### Lists & Organization
| Feature | Description |
|---------|-------------|
| Watchlist | Bookmark titles to watch later |
| Currently Watching | Track TV show progress (season/episode) |
| Custom Lists | Create themed collections with icons, public/private toggle |
| Drag-to-Reorder | Reorder items within custom lists |

### Profile & Insights
| Feature | Description |
|---------|-------------|
| Taste Insights | Top genres, favorite director, favorite actor, favorite decade |
| Stats | Total films, shows, watch time, rank count |
| Recent Activity | Timeline of user's activity |

---

## App Screens

### Tabs (`app/(tabs)/`)
| Screen | File | Description |
|--------|------|-------------|
| Feed | `index.tsx` | Activity feed from followed users |
| Discover | `discover.tsx` | Search, browse, genre filters, spotlight, pick-for-me |
| Lists | `lists.tsx` | Rankings, watchlist, currently watching, custom lists |
| Leaderboard | `leaderboard.tsx` | Top rankers by movie/show count |
| Profile | `profile.tsx` | User stats, taste insights, recent activity |

### Auth (`app/(auth)/`)
| Screen | File | Description |
|--------|------|-------------|
| Landing | `index.tsx` | Auth landing page |
| Sign In | `sign-in.tsx` | Email/password login |
| Sign Up | `sign-up.tsx` | Registration with username |
| Verify Email | `verify-email.tsx` | Email verification flow |

### Content Detail
| Screen | File | Description |
|--------|------|-------------|
| Title Detail | `title/[id].tsx` | Universal movie/TV detail page |
| Person | `person/[id].tsx` | Actor/director filmography |
| Movie (Legacy) | `movie/[id].tsx` | Legacy movie detail |

### Activity & Social
| Screen | File | Description |
|--------|------|-------------|
| Log Activity | `log-activity/[contentId].tsx` | Rate, review, log progress |
| Activity Detail | `activity-detail/[id].tsx` | Full activity with likes/comments |
| Review Detail | `review-detail/[id].tsx` | Review with nested comments |
| Activity History | `activity-history/[contentId].tsx` | Watch history for a title |
| User Activity | `user-activity/[userId].tsx` | User's activity timeline |
| User Profile | `user/[id].tsx` | Other user's profile |
| Notifications | `notifications.tsx` | Notification feed with mark-as-read |

### Rankings & Lists
| Screen | File | Description |
|--------|------|-------------|
| Rankings | `rankings.tsx` | Draggable ranked list with scores |
| Rank Flow | `rank/[movieId].tsx` | Binary insertion ranking modal |
| Watchlist | `watchlist.tsx` | Bookmarked titles |
| Currently Watching | `currently-watching.tsx` | In-progress watches |
| List Detail | `list/[id].tsx` | Custom list with reorder |
| Create List | `create-list.tsx` | New list with icon picker |

### User Management
| Screen | File | Description |
|--------|------|-------------|
| Follow List | `follow-list.tsx` | Followers/following |
| Friend Picker | `friend-picker.tsx` | Tag friends in reviews |
| Settings | `settings.tsx` | App settings |
| Account | `account.tsx` | Account details, delete account |
| Edit Profile | `edit-profile.tsx` | Edit username, bio, avatar |
| About | `about-feedback.tsx` | About page and feedback |
| Review (Legacy) | `review/[movieId].tsx` | Legacy review modal |

---

## Lib Modules (`lib/`)

### API & Data
| Module | Description |
|--------|-------------|
| `tmdb.ts` | TMDB API client: search, trending, discover, details, cast, videos |
| `omdb.ts` | OMDb API: IMDb/Rotten Tomatoes/Metascore ratings |
| `supabase.ts` | Supabase client initialization |
| `content.ts` | Ensure content exists in DB, get by TMDB ID |

### Core Features
| Module | Description |
|--------|-------------|
| `ranking.ts` | Binary insertion algorithm, score bands, reorder, display scores |
| `activity.ts` | Activity CRUD, watch cycles, progress tracking |
| `social.ts` | Likes, comments (with replies), notifications, average ratings |
| `follows.ts` | Follow/unfollow, follower lists, user search, top rankers |
| `season-ratings.ts` | Per-season TV ratings CRUD |
| `pick-for-me.ts` | Recommendation engine with scoring algorithm |
| `user-lists.ts` | Custom list CRUD, add/remove/reorder items |
| `watch-history.ts` | Watch date tracking for movies |

### Utilities
| Module | Description |
|--------|-------------|
| `recommendations.ts` | Personalized content recommendations |
| `profile-insights.ts` | Taste analytics: top genres, director, actor, decade |
| `spotlight.ts` | Spotlight carousel content |
| `validation.ts` | Input validation helpers |
| `cache.ts` | In-memory caching layer |
| `version.ts` | App version management |
| `push-notifications.ts` | Expo push token registration and handling |
| `friend-picker-state.ts` | Friend picker state management |

### Hooks
| Hook | Description |
|------|-------------|
| `hooks/useFeed.ts` | Cached feed data |
| `hooks/useUserData.ts` | Cached user profile/stats |
| `hooks/useAppUpdate.ts` | App update detection via `app_config` table |

### Context
| Provider | Description |
|----------|-------------|
| `auth-context.tsx` | Authentication state and session management |
| `cache-context.tsx` | Cache invalidation across screens |

---

## Database Schema (20 tables)

### Core Tables
| Table | Purpose |
|-------|---------|
| `users` | User profiles (extends auth.users): username, display_name, bio, avatar, curation_identity |
| `content` | Unified movies & TV shows cached from TMDB: tmdb_id, content_type, title, genres, runtime, lead_actor |
| `activity_log` | All user activity: status (completed/in_progress/bookmarked), star_rating (0.5–5), review_text, tagged_friends, watch_date |
| `watches` | Watch cycles for rewatches: watch_number, status, started_at, completed_at |
| `rankings` | Ranked content: rank_position, display_score (1–10), content_type (movie/tv) |

### Engagement Tables
| Table | Purpose |
|-------|---------|
| `bookmarks` | Watchlist items (user_id, content_id) |
| `likes` | Activity/review likes |
| `comments` | Comments with threaded replies (parent_id) |
| `comment_likes` | Comment likes |
| `season_ratings` | Per-season TV ratings with half-star support and review text |

### Social Tables
| Table | Purpose |
|-------|---------|
| `follows` | Instant follow system (follower_id, following_id) |
| `notifications` | In-app notifications: like, comment, tagged, follow, reply |
| `push_tokens` | Expo push notification tokens per device |

### System Tables
| Table | Purpose |
|-------|---------|
| `app_config` | App version management for update prompts |
| `user_lists` | Custom user-created lists with icons and public/private toggle |
| `user_list_items` | Items within custom lists with position ordering |
| `pick_suggestions` | Pick-for-me suggestion tracking with scoring breakdown |

### Legacy Tables (still active, not yet migrated)
| Table | Purpose |
|-------|---------|
| `movies` | Original TMDB movie cache (superseded by `content`, still written to) |
| `reviews` | Original review table (superseded by `activity_log`, review modal still writes here) |
| `watch_history` | Watch date tracking for movies |

### Key RPC Functions
| Function | Purpose |
|----------|---------|
| `reorder_rankings_batch` | Atomic batch ranking reorder with deferred constraints |
| `shift_rankings_down` | Shift positions for new ranking insertion (descending order) |
| `delete_user_account` | Secure self-deletion with cascade cleanup |
| `check_email_verified` | Check email verification status |
| `resolve_notification_target` | Resolve notification review_id to navigation data (SECURITY DEFINER) |
| `handle_new_user` | Auto-create user profile on auth signup |
| `handle_new_notification` | Trigger push notification edge function on notification insert |

---

## Edge Functions (`supabase/functions/`)

| Function | Purpose |
|----------|---------|
| `push-notification` | Sends Expo push notifications on notification INSERT (triggered by database webhook) |
| `broadcast-notification` | Sends notifications to multiple users at once |
| `backfill-lead-actor` | One-time data backfill for lead actor field in content table |

---

## Environment Setup

### Dev/Prod Separation
| Environment | Supabase Project | Purpose |
|-------------|-----------------|---------|
| Development | `seen-dev` (`snrzwaqdhkqsnuwphxnz`) | Local dev, safe to break |
| Production | `Seen` (`hsuydsuebluhycdeqghv`) | Real users, protected |

### Environment Files
| File | Purpose |
|------|---------|
| `.env` | Default local dev (points to dev project) |
| `.env.development` | Dev project keys (not committed) |
| `.env.production` | Production keys (not committed, used by deploy script) |

### EAS Build Profiles
| Profile | APP_ENV | Use |
|---------|---------|-----|
| `development` | `development` | Dev client with hot reload |
| `preview` | `development` | Internal distribution testing |
| `production` | `production` | App Store submission |

### Deploy Command
```bash
npm run deploy  # or: bash scripts/deploy.sh
```
Builds iOS, submits to App Store, updates `app_config.latest_version` in Supabase. Requires confirmation, `.env.production`, and clean git state.

---

## Ranking System — Technical Specification

### Star Rating to Score Band Mapping

| Star Rating | Score Range | Band Width |
|-------------|-------------|------------|
| 5 stars | 9.5 – 10.0 | 0.5 |
| 4 stars | 8.0 – 9.4 | 1.4 |
| 3 stars | 6.0 – 7.9 | 1.9 |
| 2 stars | 4.0 – 5.9 | 1.9 |
| 1 star | 1.0 – 3.9 | 2.9 |

### How Ranking Works

1. User rates a title (0.5–5 stars)
2. System finds all titles in the same star tier
3. Binary search via pairwise comparisons ("Do you prefer A or B?") finds exact position
4. Existing rankings shift down to make room (`shift_rankings_down` RPC)
5. Display score calculated from position within tier
6. Title auto-removed from watchlist if bookmarked

### Reordering
- Drag-to-reorder updates all affected positions atomically via `reorder_rankings_batch` RPC
- Unique constraint `(user_id, content_type, rank_position)` is `DEFERRABLE INITIALLY DEFERRED` to allow batch swaps
- Moving across star tier boundaries updates the star rating

---

## File Structure

```
Seen/
├── app/                          # Expo Router screens
│   ├── (auth)/                   # Auth flow (sign-in, sign-up, verify)
│   ├── (tabs)/                   # Main tabs (feed, discover, lists, leaderboard, profile)
│   ├── title/[id].tsx            # Universal title detail
│   ├── person/[id].tsx           # Person filmography
│   ├── rank/[movieId].tsx        # Ranking flow
│   ├── log-activity/[contentId].tsx  # Log/rate/review
│   ├── activity-detail/[id].tsx  # Activity with comments
│   ├── user/[id].tsx             # User profile
│   ├── notifications.tsx         # Notification feed
│   ├── rankings.tsx              # Ranked list with reorder
│   ├── watchlist.tsx             # Bookmarked titles
│   ├── currently-watching.tsx    # In-progress watches
│   ├── list/[id].tsx             # Custom list detail
│   ├── create-list.tsx           # New list creation
│   ├── settings.tsx              # App settings
│   └── _layout.tsx               # Root layout (auth, Sentry, PostHog)
├── components/                   # Reusable UI components
│   ├── ui/                       # Base elements (star-rating, loaders, icons)
│   ├── activity-feed-card.tsx    # Feed activity card
│   ├── draggable-rank-list/      # Drag-and-drop ranking
│   ├── pick-for-me-modal.tsx     # Pick recommendation modal
│   ├── season-rating-sheet.tsx   # Season rating bottom sheet
│   ├── add-to-list-modal.tsx     # Add to list modal
│   └── ...
├── lib/                          # Core business logic
│   ├── ranking.ts                # Ranking algorithm & score calculation
│   ├── activity.ts               # Activity CRUD & watch cycles
│   ├── social.ts                 # Likes, comments, notifications
│   ├── follows.ts                # Follow system & user search
│   ├── tmdb.ts                   # TMDB API client
│   ├── pick-for-me.ts            # Recommendation engine
│   ├── season-ratings.ts         # TV season ratings
│   ├── user-lists.ts             # Custom lists
│   ├── auth-context.tsx          # Auth state provider
│   ├── cache-context.tsx         # Cache invalidation
│   └── hooks/                    # Custom React hooks
├── constants/                    # Theme colors, config
├── types/                        # TypeScript definitions
├── assets/                       # Images, fonts
├── supabase/
│   ├── schema.sql                # Base database schema
│   ├── migrations/               # Sequential migrations (001–033)
│   └── functions/                # Edge functions (push notifications)
├── scripts/
│   └── deploy.sh                 # Production deploy script
├── app.config.ts                 # Dynamic Expo config (dev/prod names)
├── eas.json                      # EAS Build profiles
└── CLAUDE.md                     # AI assistant instructions
```
