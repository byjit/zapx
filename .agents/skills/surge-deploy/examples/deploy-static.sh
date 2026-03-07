#!/bin/bash
# Deploy a plain HTML/CSS/JS site to surge.sh
# Usage: ./deploy-static.sh [folder] [domain-name]

set -euo pipefail

FOLDER="${1:-.}"
DOMAIN="${2:-my-site-$(head -c 4 /dev/urandom | xxd -p).surge.sh}"

# Verify index.html exists
if [ ! -f "$FOLDER/index.html" ]; then
  echo "Error: No index.html found in $FOLDER"
  exit 1
fi

# Deploy
echo "Deploying $FOLDER to $DOMAIN..."
surge "$FOLDER" "$DOMAIN"

echo ""
echo "Live at: https://$DOMAIN"
