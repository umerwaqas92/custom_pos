#!/bin/bash
# Double-click on Mac to open MZK POS desktop window
cd "$(dirname "$0")"
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
if [ ! -d node_modules/electron ]; then
  echo "Installing dependencies (first run)..."
  npm install
fi
npm run electron:dev
