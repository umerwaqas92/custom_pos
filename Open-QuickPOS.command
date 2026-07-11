#!/bin/bash
# Forces Chrome to use the real InfinityFree IP for quickpos.xo.je
IP="185.27.134.153"
DOMAIN="quickpos.xo.je"
URL="http://quickpos.xo.je/"
DIR="$HOME/.quickpos-chrome-profile"
mkdir -p "$DIR"

# Optional: update hosts without password if already writable (usually needs sudo once)
if ! grep -q "185.27.134.153.*quickpos.xo.je" /etc/hosts 2>/dev/null; then
  osascript -e 'do shell script "grep -v quickpos.xo.je /etc/hosts > /tmp/hosts.qp; echo \"185.27.134.153 quickpos.xo.je\" >> /tmp/hosts.qp; cp /tmp/hosts.qp /etc/hosts; dscacheutil -flushcache; killall -HUP mDNSResponder" with administrator privileges' 2>/dev/null || true
fi

open -na "Google Chrome" --args \
  --user-data-dir="$DIR" \
  --host-resolver-rules="MAP ${DOMAIN} ${IP}, EXCLUDE localhost" \
  --disable-features=IsolateOrigins,site-per-process \
  --new-window \
  "$URL"
