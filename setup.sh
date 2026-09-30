#!/usr/bin/env sh
# macOS / Linux one-click installer. Run:  sh setup.sh
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install the LTS version from https://nodejs.org and run this file again."
  exit 1
fi
exec node scripts/setup.mjs
