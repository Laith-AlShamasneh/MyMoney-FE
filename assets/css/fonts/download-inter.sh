#!/usr/bin/env bash
# FH3: download the self-hosted Inter woff2 files into ./files/
# Run from assets/css/fonts/ :  bash download-inter.sh
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p files
curl -fsSL "https://fonts.gstatic.com/s/inter/v20/UcC53FwrK3iLTcvneQg7B5iqpJlhKnPCkaL0UUMJng.woff2" -o "files/UcC53FwrK3iLTcvneQg7B5iqpJlhKnPCkaL0UUMJng.woff2"
curl -fsSL "https://fonts.gstatic.com/s/inter/v20/UcC53FwrK3iLTcvneQg7B5iqpJlhKnPCkaL1UUMJng.woff2" -o "files/UcC53FwrK3iLTcvneQg7B5iqpJlhKnPCkaL1UUMJng.woff2"
curl -fsSL "https://fonts.gstatic.com/s/inter/v20/UcC53FwrK3iLTcvneQg7B5iqpJlhKnPCkaL2UUMJng.woff2" -o "files/UcC53FwrK3iLTcvneQg7B5iqpJlhKnPCkaL2UUMJng.woff2"
curl -fsSL "https://fonts.gstatic.com/s/inter/v20/UcC53FwrK3iLTcvneQg7B5iqpJlhKnPCkaL3UUMJng.woff2" -o "files/UcC53FwrK3iLTcvneQg7B5iqpJlhKnPCkaL3UUMJng.woff2"
curl -fsSL "https://fonts.gstatic.com/s/inter/v20/UcC53FwrK3iLTcvneQg7B5iqpJlhKnPCkaL5UUM.woff2" -o "files/UcC53FwrK3iLTcvneQg7B5iqpJlhKnPCkaL5UUM.woff2"
curl -fsSL "https://fonts.gstatic.com/s/inter/v20/UcC53FwrK3iLTcvneQg7B5iqpJlhKnPCkaL6UUMJng.woff2" -o "files/UcC53FwrK3iLTcvneQg7B5iqpJlhKnPCkaL6UUMJng.woff2"
curl -fsSL "https://fonts.gstatic.com/s/inter/v20/UcC53FwrK3iLTcvneQg7B5iqpJlhKnPCkaL9UUMJng.woff2" -o "files/UcC53FwrK3iLTcvneQg7B5iqpJlhKnPCkaL9UUMJng.woff2"
curl -fsSL "https://fonts.gstatic.com/s/inter/v20/UcCo3FwrK3iLTcvhYwYL8g.woff2" -o "files/UcCo3FwrK3iLTcvhYwYL8g.woff2"
curl -fsSL "https://fonts.gstatic.com/s/inter/v20/UcCo3FwrK3iLTcviYwY.woff2" -o "files/UcCo3FwrK3iLTcviYwY.woff2"
curl -fsSL "https://fonts.gstatic.com/s/inter/v20/UcCo3FwrK3iLTcvmYwYL8g.woff2" -o "files/UcCo3FwrK3iLTcvmYwYL8g.woff2"
curl -fsSL "https://fonts.gstatic.com/s/inter/v20/UcCo3FwrK3iLTcvsYwYL8g.woff2" -o "files/UcCo3FwrK3iLTcvsYwYL8g.woff2"
curl -fsSL "https://fonts.gstatic.com/s/inter/v20/UcCo3FwrK3iLTcvtYwYL8g.woff2" -o "files/UcCo3FwrK3iLTcvtYwYL8g.woff2"
curl -fsSL "https://fonts.gstatic.com/s/inter/v20/UcCo3FwrK3iLTcvuYwYL8g.woff2" -o "files/UcCo3FwrK3iLTcvuYwYL8g.woff2"
curl -fsSL "https://fonts.gstatic.com/s/inter/v20/UcCo3FwrK3iLTcvvYwYL8g.woff2" -o "files/UcCo3FwrK3iLTcvvYwYL8g.woff2"
echo "Downloaded 14 Inter woff2 files into files/"
