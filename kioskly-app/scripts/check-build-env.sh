#!/bin/sh
# Prints the EXPO_PUBLIC_API_URL that will be baked into this release build,
# and refuses to proceed if it looks like a local/dev address. Local release
# builds (./gradlew assembleRelease) compile whatever .env says at build
# time directly into the JS bundle — an uncaught stale dev URL here means
# every install of the resulting APK silently fails to reach the real API.
set -e

ENV_FILE="$(dirname "$0")/../.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: kioskly-app/.env not found. EXPO_PUBLIC_API_URL must be set before building a release APK."
  exit 1
fi

API_URL=$(grep -E '^EXPO_PUBLIC_API_URL=' "$ENV_FILE" | tail -n1 | cut -d= -f2-)

if [ -z "$API_URL" ]; then
  echo "ERROR: EXPO_PUBLIC_API_URL is not set (or is commented out) in kioskly-app/.env."
  echo "This value gets baked permanently into the APK — set it to the production URL first."
  exit 1
fi

echo ""
echo ">>> Building release APK with EXPO_PUBLIC_API_URL=$API_URL"
echo ""

case "$API_URL" in
  *localhost*|*127.0.0.1*|*10.0.2.2*|*192.168.*|*10.0.0.*|*10.0.1.*)
    echo "ERROR: EXPO_PUBLIC_API_URL looks like a local/dev address ($API_URL)."
    echo "Refusing to build a release APK with this value. Update kioskly-app/.env to the production URL and try again."
    exit 1
    ;;
esac
