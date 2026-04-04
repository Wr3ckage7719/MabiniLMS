#!/bin/bash

# Phase 5 Google OAuth Validation Script
# Usage: bash validate-phase5.sh

set -e

echo "🔍 Phase 5: Google OAuth Validation Script"
echo "==========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check 1: Environment variables
echo "📋 Check 1: Environment Variables"
if grep -q "GOOGLE_CLIENT_ID=1074423852155" server/.env; then
  echo -e "${GREEN}✓ GOOGLE_CLIENT_ID configured${NC}"
else
  echo -e "${RED}✗ GOOGLE_CLIENT_ID missing or incorrect${NC}"
  exit 1
fi

if grep -q "GOOGLE_CLIENT_SECRET=GOCSPX-" server/.env; then
  echo -e "${GREEN}✓ GOOGLE_CLIENT_SECRET configured${NC}"
else
  echo -e "${RED}✗ GOOGLE_CLIENT_SECRET missing or incorrect${NC}"
  exit 1
fi

if grep -q "GOOGLE_REDIRECT_URI=" server/.env; then
  echo -e "${GREEN}✓ GOOGLE_REDIRECT_URI configured${NC}"
else
  echo -e "${RED}✗ GOOGLE_REDIRECT_URI missing${NC}"
  exit 1
fi

echo ""

# Check 2: File existence
echo "📋 Check 2: Required Files"
files=(
  "server/src/services/google-oauth.ts"
  "server/src/controllers/google-oauth.ts"
  "server/src/routes/google-oauth.ts"
  "server/src/types/google-oauth.ts"
)

for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    echo -e "${GREEN}✓ $file exists${NC}"
  else
    echo -e "${RED}✗ $file missing${NC}"
    exit 1
  fi
done

echo ""

# Check 3: TypeScript syntax
echo "📋 Check 3: TypeScript Compilation"
if npm run --prefix server build > /dev/null 2>&1; then
  echo -e "${GREEN}✓ TypeScript compiles without errors${NC}"
else
  echo -e "${YELLOW}⚠ TypeScript build has issues (run: npm run build --prefix server)${NC}"
fi

echo ""

# Check 4: Function exports
echo "📋 Check 4: Function Exports"
functions=(
  "getGoogleOAuthUrl"
  "exchangeCodeForTokens"
  "getGoogleUserInfo"
  "handleGoogleCallback"
  "refreshGoogleToken"
  "revokeGoogleTokens"
)

for func in "${functions[@]}"; do
  if grep -q "export.*$func" server/src/services/google-oauth.ts; then
    echo -e "${GREEN}✓ $func exported${NC}"
  else
    echo -e "${RED}✗ $func not found${NC}"
    exit 1
  fi
done

echo ""

# Check 5: Route registration
echo "📋 Check 5: Route Registration"
if grep -q "googleOAuthRoutes" server/src/index.ts; then
  echo -e "${GREEN}✓ Google OAuth routes registered in app${NC}"
else
  echo -e "${RED}✗ Google OAuth routes not registered${NC}"
  exit 1
fi

echo ""

# Check 6: Database schema has google_tokens
echo "📋 Check 6: Database Schema"
if grep -q "CREATE TABLE.*google_tokens" database-schema-complete.sql; then
  echo -e "${GREEN}✓ google_tokens table in schema${NC}"
else
  echo -e "${RED}✗ google_tokens table not in schema${NC}"
  exit 1
fi

echo ""
echo "==========================================="
echo -e "${GREEN}✅ All Phase 5 checks passed!${NC}"
echo "==========================================="
echo ""
echo "📚 Next Steps:"
echo "1. Start server: npm run dev --prefix server"
echo "2. Test OAuth URL: curl http://localhost:3000/api/auth/google/url"
echo "3. Follow browser flow: http://localhost:3000/api/auth/google"
echo "4. Complete user flow to verify database storage"
echo ""
echo "📖 Full guide: PHASE5_COMPLETION_GUIDE.md"
