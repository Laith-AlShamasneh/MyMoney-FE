#!/usr/bin/env bash
# FH3: download the exact Chart.js 4.4.3 build into this folder for self-hosting.
# Run:  bash assets/vendors/chart.js/download-chart.sh
set -euo pipefail
cd "$(dirname "$0")"
curl -fsSL "https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js" -o chart.umd.min.js
echo "Downloaded chart.umd.min.js ($(wc -c < chart.umd.min.js) bytes)"
echo "Verify it matches the pinned SRI hash:"
printf 'sha384-'; openssl dgst -sha384 -binary chart.umd.min.js | openssl base64 -A; echo
echo "Expected: sha384-JUh163oCRItcbPme8pYnROHQMC6fNKTBWtRG3I3I0erJkzNgL7uxKlNwcrcFKeqF"
