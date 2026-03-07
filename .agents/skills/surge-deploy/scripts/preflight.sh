#!/bin/bash
# Surge Deploy Preflight Checks
# Runs all pre-deploy validations and reports status

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

DEPLOY_DIR="${1:-.}"
PASS=0
FAIL=0

check() {
  local label="$1"
  local status="$2"
  local msg="$3"
  if [ "$status" = "ok" ]; then
    echo -e "  ${GREEN}[PASS]${NC} $label"
    PASS=$((PASS + 1))
  elif [ "$status" = "warn" ]; then
    echo -e "  ${YELLOW}[WARN]${NC} $label - $msg"
  else
    echo -e "  ${RED}[FAIL]${NC} $label - $msg"
    FAIL=$((FAIL + 1))
  fi
}

echo ""
echo "Surge Deploy - Preflight Checks"
echo "================================"
echo "Deploy folder: $DEPLOY_DIR"
echo ""

# 1. Check surge CLI
if command -v surge &>/dev/null; then
  VERSION=$(surge --version 2>/dev/null | sed 's/\x1b\[[0-9;]*m//g' | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' || echo "unknown")
  check "surge CLI installed (v$VERSION)" "ok" ""
else
  check "surge CLI installed" "fail" "Run: npm install -g surge"
fi

# 2. Check authentication
AUTH=$(surge whoami 2>&1 || true)
if echo "$AUTH" | grep -q "@"; then
  EMAIL=$(echo "$AUTH" | sed 's/\x1b\[[0-9;]*m//g' | grep -oE '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+' | head -1)
  check "Authenticated as $EMAIL" "ok" ""
elif [ -n "${SURGE_TOKEN:-}" ] && [ -n "${SURGE_LOGIN:-}" ]; then
  check "Authenticated via env vars ($SURGE_LOGIN)" "ok" ""
else
  check "Authentication" "fail" "Run: surge login"
fi

# 3. Check deploy folder exists
if [ -d "$DEPLOY_DIR" ]; then
  check "Deploy folder exists" "ok" ""
else
  check "Deploy folder exists" "fail" "$DEPLOY_DIR not found"
fi

# 4. Check index.html
if [ -f "$DEPLOY_DIR/index.html" ]; then
  check "index.html found" "ok" ""
else
  check "index.html found" "fail" "No index.html in $DEPLOY_DIR"
fi

# 5. Check for 200.html (SPA support)
if [ -f "$DEPLOY_DIR/200.html" ]; then
  check "200.html (SPA routing)" "ok" ""
else
  check "200.html (SPA routing)" "warn" "Missing - SPAs may get 404 on direct URL access"
fi

# 6. Check folder size
if [ -d "$DEPLOY_DIR" ]; then
  SIZE=$(du -sh "$DEPLOY_DIR" 2>/dev/null | cut -f1)
  check "Folder size: $SIZE" "ok" ""
fi

# 7. Check for common mistakes
if [ -f "$DEPLOY_DIR/.env" ]; then
  check "No .env in deploy folder" "warn" ".env file found - may expose secrets"
fi

if [ -d "$DEPLOY_DIR/node_modules" ]; then
  check "No node_modules in deploy folder" "warn" "node_modules found - probably wrong folder"
fi

if [ -f "$DEPLOY_DIR/package.json" ] && [ ! -f "$DEPLOY_DIR/index.html" ]; then
  check "Correct folder" "warn" "Has package.json but no index.html - did you forget to build?"
fi

echo ""
echo "================================"
echo -e "Results: ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}"

if [ "$FAIL" -gt 0 ]; then
  echo -e "${RED}Fix the failures above before deploying.${NC}"
  exit 1
else
  echo -e "${GREEN}Ready to deploy.${NC}"
  exit 0
fi
