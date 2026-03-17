#!/bin/bash
# Syncs data from production Supabase to dev.
# Only writes to dev — production is read-only.
#
# Usage:
#   PROD_DB_PASSWORD=xxx DEV_DB_PASSWORD=yyy bash scripts/sync_dev_from_prod.sh
#
# Passwords are in Supabase Dashboard → Project → Settings → Database → Connection string

set -e

PROD_HOST="db.hsuydsuebluhycdeqghv.supabase.co"
DEV_HOST="db.snrzwaqdhkqsnuwphxnz.supabase.co"
DB_PORT="5432"
DB_NAME="postgres"
DB_USER="postgres"

PROD_URL="postgresql://${DB_USER}:${PROD_DB_PASSWORD}@${PROD_HOST}:${DB_PORT}/${DB_NAME}"
DEV_URL="postgresql://${DB_USER}:${DEV_DB_PASSWORD}@${DEV_HOST}:${DB_PORT}/${DB_NAME}"

DUMP_FILE="/tmp/seen_prod_data.sql"

# Tables to sync (order matters for foreign keys)
TABLES=(
  content
  movies
  activity_log
  rankings
  bookmarks
  follows
  watches
  season_ratings
  user_lists
  user_list_items
  pick_suggestions
  likes
  comments
  comment_likes
)

if [ -z "$PROD_DB_PASSWORD" ] || [ -z "$DEV_DB_PASSWORD" ]; then
  echo "Error: PROD_DB_PASSWORD and DEV_DB_PASSWORD must be set."
  echo "Find them in Supabase Dashboard → Settings → Database → Connection string"
  exit 1
fi

echo "=== Syncing production → dev ==="
echo ""

# Build -t flags for pg_dump
TABLE_FLAGS=""
for table in "${TABLES[@]}"; do
  TABLE_FLAGS="$TABLE_FLAGS -t public.$table"
done

echo "Dumping data from production..."
PGPASSWORD="$PROD_DB_PASSWORD" pg_dump \
  "$PROD_URL" \
  --data-only \
  --no-owner \
  --no-privileges \
  --disable-triggers \
  $TABLE_FLAGS \
  -f "$DUMP_FILE"

echo "Dump complete: $DUMP_FILE"
echo ""

echo "Restoring into dev..."
PGPASSWORD="$DEV_DB_PASSWORD" psql "$DEV_URL" \
  -c "SET session_replication_role = replica;" \
  -f "$DUMP_FILE" \
  -c "SET session_replication_role = DEFAULT;"

echo ""
echo "=== Sync complete ==="

rm -f "$DUMP_FILE"
