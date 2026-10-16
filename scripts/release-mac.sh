#!/bin/bash
# Build .dmg Jekardah Chat untuk Apple Silicon (arm64) & Intel (x64).
#
# Otomatis memilih cara tanda tangan:
#  - Ada sertifikat "Developer ID Application" + profil notarisasi  -> ditandatangani, dinotarisasi Apple, di-staple
#    (aplikasi langsung terbuka tanpa peringatan Gatekeeper).
#  - Belum ada -> tanda tangan ad-hoc (pengguna perlu "Open Anyway" sekali di Privacy & Security).
#
# Prasyarat notarisasi (sekali saja, butuh membership Apple Developer aktif):
#   1. Xcode → Settings → Accounts → Manage Certificates → + → Developer ID Application
#   2. xcrun notarytool store-credentials jekardah-notary --apple-id <email> --team-id <TEAMID>
set -euo pipefail
cd "$(dirname "$0")/.."
PROFILE="${APPLE_KEYCHAIN_PROFILE:-jekardah-notary}"
OUT="${OUT_DIR:-/tmp/jekardah-chat-dist}"   # di luar folder tersinkron iCloud (lihat README)
VERSION=$(node -p "require('./package.json').version")

NOTARIZE=0
if security find-identity -v -p codesigning | grep -q "Developer ID Application" \
  && security find-generic-password -s com.apple.gke.notary.tool -a "$PROFILE" >/dev/null 2>&1; then
  NOTARIZE=1
fi

rm -rf "$OUT"
if [ "$NOTARIZE" = 1 ]; then
  echo "== Mode: Developer ID + notarisasi Apple"
  APPLE_KEYCHAIN_PROFILE="$PROFILE" npx electron-builder --mac dmg --arm64 --x64 --publish never \
    --config.directories.output="$OUT"
else
  echo "== Mode: tanda tangan ad-hoc (sertifikat Developer ID / profil notarisasi belum ada)"
  npx electron-builder --mac dmg --arm64 --x64 --publish never \
    --config.directories.output="$OUT" \
    --config.mac.identity=- --config.mac.notarize=false --config.mac.hardenedRuntime=false --config.dmg.sign=false
fi

for ARCH in arm64 x64; do
  DMG="$OUT/Jekardah-Chat-$VERSION-$ARCH.dmg"
  hdiutil verify "$DMG" >/dev/null && echo "OK  $DMG"
  if [ "$NOTARIZE" = 1 ]; then
    xcrun notarytool submit "$DMG" --keychain-profile "$PROFILE" --wait
    xcrun stapler staple "$DMG"
    spctl -a -t open --context context:primary-signature -vv "$DMG"
  fi
done
(cd "$OUT" && shasum -a 256 Jekardah-Chat-"$VERSION"-*.dmg > SHA256SUMS.txt && cat SHA256SUMS.txt)
echo "NOTARIZED=$NOTARIZE"
echo "Selesai: $OUT"
