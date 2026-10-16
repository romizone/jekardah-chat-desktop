# Jekardah Chat untuk macOS & Windows

Aplikasi desktop Mac & Windows untuk **[Jekardah Chat](https://chat.jekardah.com)** — chat ala WhatsApp dengan **alamat email Gmail**, tanpa nomor HP.

![Ikon](build/icon-1024.png)

## Unduh

Buka halaman **[Releases](https://github.com/romizone/jekardah-chat-desktop/releases/latest)** dan pilih:

| Komputer Anda | File |
|---|---|
| Windows 10/11 (64-bit) | `Jekardah-Chat-Setup-<versi>-x64.exe` |
| Mac Apple Silicon (M1/M2/M3/M4…) | `Jekardah-Chat-<versi>-arm64.dmg` |
| Mac Intel | `Jekardah-Chat-<versi>-x64.dmg` |

Mac: tidak yakin? Klik menu  → **About This Mac**. Jika tertulis *Chip Apple M…*, pilih **arm64**.

## Cara pasang — Windows

1. Jalankan `Jekardah-Chat-Setup-<versi>-x64.exe`. Aplikasi langsung terpasang (tanpa hak admin) dan terbuka.
2. Karena installer belum ditandatangani sertifikat Windows, SmartScreen bisa menampilkan *"Windows protected your PC"*:
   klik **More info → Run anyway**. Langkah ini hanya sekali.
3. Shortcut tersedia di Desktop dan Start Menu. Hapus lewat **Settings → Apps → Jekardah Chat → Uninstall**.

## Cara pasang — Mac

1. Buka file `.dmg`, lalu seret **Jekardah Chat** ke folder **Applications**.
2. Buka **Jekardah Chat** dari Launchpad / folder Applications.
3. Karena aplikasi belum ditandatangani Apple Developer ID, macOS akan memperingatkan saat pertama kali dibuka:
   - Buka **System Settings → Privacy & Security**, gulir ke bawah, klik **Open Anyway** untuk *Jekardah Chat*, lalu **Open**.
   - Atau di Terminal: `xattr -cr "/Applications/Jekardah Chat.app"` lalu buka aplikasinya.

Langkah ini hanya perlu sekali.

## Fitur

- Semua fitur chat.jekardah.com: chat, grup, foto, video, dokumen, stiker, balas pesan, kamera.
- **Mac:** badge jumlah chat belum dibaca di ikon Dock + ikon memantul saat ada pesan baru.
- **Mac:** notifikasi macOS untuk pesan baru, juga saat jendela ditutup (aplikasi tetap berjalan di Dock — keluar dengan ⌘Q).
- Login dengan akun Google di dalam aplikasi.
- Selalu versi terbaru: tampilan & fitur mengikuti chat.jekardah.com tanpa perlu install ulang.
- Hanya satu jendela; link luar dibuka di browser; posisi & ukuran jendela diingat.
- Kembali tersambung otomatis saat internet terputus.
- **Windows:** ikon di system tray (menutup jendela = tetap berjalan di tray, keluar lewat menu tray atau Ctrl+Q),
  titik biru di ikon taskbar + taskbar berkedip saat ada chat belum dibaca, notifikasi Windows.

## Pengembangan

```bash
npm install
npm start                 # jalankan aplikasi
npm run icon              # buat ulang ikon (build/icon.icns)
npm run dist              # buat .dmg untuk arm64 & x64 (folder dist/)
npm run dist:win          # buat installer Windows .exe (NSIS, x64) — bisa dari Mac tanpa Wine
npm run release           # build rilis: ditandatangani + dinotarisasi Apple bila sertifikat
                          # Developer ID & profil notarisasi tersedia, selain itu ad-hoc
```

Notarisasi Apple (agar aplikasi langsung terbuka tanpa peringatan) butuh membership Apple Developer aktif:
1. Xcode → Settings → Accounts → Manage Certificates → **+** → *Developer ID Application*
2. `xcrun notarytool store-credentials jekardah-notary --apple-id <email> --team-id <TEAMID>`
3. `npm run release`

> Bila build gagal dengan *"resource fork, Finder information, or similar detritus not allowed"* (folder tersinkron iCloud), arahkan hasil build ke luar folder tersebut:
> `npx electron-builder --mac dmg --arm64 --x64 --config.directories.output=/tmp/jekardah-dist`

Aplikasi ini membungkus https://chat.jekardah.com dengan [Electron](https://www.electronjs.org/).
