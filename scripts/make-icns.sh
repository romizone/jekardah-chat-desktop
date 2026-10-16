#!/bin/bash
# Membuat build/icon.icns dari build/icon-1024.png (semua ukuran yang dibutuhkan macOS)
set -e
cd "$(dirname "$0")/../build"
rm -rf icon.iconset && mkdir icon.iconset
for s in 16 32 128 256 512; do
  sips -z $s $s icon-1024.png --out icon.iconset/icon_${s}x${s}.png >/dev/null
  sips -z $((s*2)) $((s*2)) icon-1024.png --out icon.iconset/icon_${s}x${s}@2x.png >/dev/null
done
iconutil -c icns icon.iconset -o icon.icns
rm -rf icon.iconset
echo "build/icon.icns siap"
