#!/bin/bash
# Uji otomatis aplikasi desktop terhadap server lokal: jalankan dulu `npm run dev` (DEV_LOGIN=1) di folder web.
# Memakai akun uji zztest.desk.* dan data aplikasi sementara; sesi login asli tidak tersentuh.
set -euo pipefail
cd "$(dirname "$0")/.."
export JEKARDAH_URL="${JEKARDAH_URL:-http://localhost:3000}"
export JEKARDAH_SELFTEST_DATA="$(node scripts/selftest-seed.mjs)"
JEKARDAH_SELFTEST="$PWD/scripts/selftest.js" npx electron .
