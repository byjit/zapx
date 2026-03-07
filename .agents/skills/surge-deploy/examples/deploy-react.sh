#!/bin/bash
# Deploy a React/Vite project to surge.sh
# Usage: ./deploy-react.sh [domain-name]

set -euo pipefail

DOMAIN="${1:-my-react-app-$(head -c 4 /dev/urandom | xxd -p).surge.sh}"
BUILD_DIR="./dist"

# Build the project
echo "Building project..."
npm run build

# Handle SPA routing
if [ ! -f "$BUILD_DIR/200.html" ]; then
  echo "Creating 200.html for SPA routing..."
  cp "$BUILD_DIR/index.html" "$BUILD_DIR/200.html"
fi

# Deploy
echo "Deploying to $DOMAIN..."
surge "$BUILD_DIR" "$DOMAIN"

echo ""
echo "Live at: https://$DOMAIN"
