#!/bin/bash
set -e

# Require explicit production confirmation
echo "⚠️  You are about to deploy to PRODUCTION"
echo "This will build, submit to App Store, and update the production database."
read -p "Type 'deploy' to confirm: " confirm
if [ "$confirm" != "deploy" ]; then
  echo "Aborted."
  exit 1
fi

# Load production env
if [ -f .env.production ]; then
  export $(grep -v '^#' .env.production | xargs)
else
  echo "Error: .env.production not found"
  exit 1
fi

# Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
  echo "Error: You have uncommitted changes. Commit or stash first."
  exit 1
fi

# Read version from app config
VERSION=$(node -p "require('./app.json').expo.version")
echo "Deploying Seen v${VERSION}..."

# Build for iOS
echo "Building iOS production..."
eas build --platform ios --profile production --non-interactive

# Submit to App Store
echo "Submitting to App Store..."
eas submit --platform ios --profile production --non-interactive

# Update Supabase app_config
echo "Updating Supabase app_config.latest_version to ${VERSION}..."
PROJECT_REF=$(echo "$EXPO_PUBLIC_SUPABASE_URL" | sed 's|https://||' | sed 's|\.supabase\.co.*||')

curl -s -X POST \
  "https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"query\": \"UPDATE app_config SET latest_version = '${VERSION}', updated_at = NOW() WHERE id = 1;\"}"

echo ""
echo "Done! Seen v${VERSION} deployed to production."
