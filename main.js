// Jekardah Chat untuk macOS & Windows — membungkus https://chat.jekardah.com dalam jendela aplikasi sendiri.
const { app, BrowserWindow, Menu, Tray, nativeImage, shell, session, systemPreferences, nativeTheme, ipcMain, dialog, net, clipboard } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const APP_URL = (process.env.JEKARDAH_URL || 'https://chat.jekardah.com').replace(/\/$/, '');
const APP_ORIGIN = new URL(APP_URL).origin;
const GOOGLE_HOSTS = ['accounts.google.com', 'accounts.youtube.com', 'ssl.gstatic.com', 'www.gstatic.com'];
const SNAPSHOT = process.env.JEKARDAH_SNAPSHOT; // khusus pengujian: simpan tangkapan layar lalu keluar
const UPDATE_PROBE = process.env.JEKARDAH_UPDATE_PROBE; // khusus pengujian: cetak hasil cek pembaruan lalu keluar
const RELEASES_API = 'https://api.github.com/repos/romizone/jekardah-chat-desktop/releases/latest';
const RELEASES_PAGE = 'https://github.com/romizone/jekardah-chat-desktop/releases/latest';

let win = null;
let tray = null;
let quitting = false;
let lastBadge = 0;
const IS_MAC = process.platform === 'darwin';
const IS_WIN = process.platform === 'win32';
const asset = (name) => path.join(__dirname, 'build', name);

// Windows: notifikasi butuh AppUserModelID yang sama dengan shortcut installer (appId)
if (IS_WIN) app.setAppUserModelId('com.jekardah.chat');

// Google menolak login dari "browser tertanam" yang mengaku Electron, jadi pakai user agent Chrome biasa.
app.userAgentFallback = app.userAgentFallback
  .replace(/\s(Electron|jekardah-chat-desktop|Jekardah Chat)\/\S+/g, '')
  .trim();

// Satu aplikasi saja yang berjalan; membuka lagi = memunculkan jendela yang ada.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
}

const isAppUrl = (url) => {
  try {
    return new URL(url).origin === APP_ORIGIN;
  } catch {
    return false;
  }
};
const isGoogleUrl = (url) => {
  try {
    return GOOGLE_HOSTS.includes(new URL(url).hostname);
  } catch {
    return false;
  }
};

// ---------- Posisi & ukuran jendela diingat ----------
const stateFile = () => path.join(app.getPath('userData'), 'window.json');
function loadBounds() {
  try {
    return JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
  } catch {
    return { width: 1200, height: 800 };
  }
}
function saveBounds() {
  if (!win || win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return;
  try {
    fs.writeFileSync(stateFile(), JSON.stringify(win.getBounds()));
  } catch {
    /* abaikan */
  }
}

function showWindow() {
  if (!win || win.isDestroyed()) return createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createWindow() {
  const bounds = loadBounds();
  win = new BrowserWindow({
    ...bounds,
    minWidth: 760,
    minHeight: 520,
    title: 'Jekardah Chat',
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#12161C' : '#E7F1F9',
    icon: IS_MAC ? undefined : asset('icon.png'),
    autoHideMenuBar: IS_WIN, // menu muncul dengan tombol Alt, seperti aplikasi Windows modern
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      spellcheck: true,
    },
  });

  win.once('ready-to-show', () => {
    if (!SNAPSHOT) win.show();
  });
  win.on('resize', saveBounds);
  win.on('move', saveBounds);

  // Menutup jendela = menyembunyikan (pesan & notifikasi tetap masuk); Mac: tetap di Dock, Windows: di system tray
  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      win.hide();
    }
  });

  const wc = win.webContents;

  // Jumlah chat belum dibaca dari judul halaman "(3) Jekardah Chat":
  // Mac -> badge di Dock; Windows -> titik di ikon taskbar + judul jendela + tooltip tray
  wc.on('page-title-updated', (e, title) => {
    e.preventDefault();
    const n = Number((/^\((\d+)\)/.exec(title) || [])[1] || 0);
    if (IS_MAC) {
      win.setTitle('Jekardah Chat');
      app.dock?.setBadge(n ? String(n) : '');
      if (n > lastBadge && !win.isFocused()) app.dock?.bounce('informational');
    } else {
      win.setTitle(n ? `(${n}) Jekardah Chat` : 'Jekardah Chat');
      win.setOverlayIcon(n ? nativeImage.createFromPath(asset('badge.png')) : null, n ? `${n} chat belum dibaca` : '');
      if (n > lastBadge && !win.isFocused()) win.flashFrame(true);
      tray?.setToolTip(n ? `Jekardah Chat — ${n} chat belum dibaca` : 'Jekardah Chat');
    }
    lastBadge = n;
  });
  win.on('focus', () => win.flashFrame(false));

  // Klik kanan: Salin / Tempel, simpan & salin gambar, link (Electron tidak punya menu bawaan).
  // Klik kanan pada bubble pesan ditangani halaman chat sendiri (menu Balas, Salin, Unduh, reaksi).
  wc.on('context-menu', (e, p) => {
    const items = [];
    const sep = () => { if (items.length && items[items.length - 1].type !== 'separator') items.push({ type: 'separator' }); };
    if (p.isEditable) {
      items.push(
        { role: 'cut', label: 'Potong', enabled: p.editFlags.canCut },
        { role: 'copy', label: 'Salin', enabled: p.editFlags.canCopy },
        { role: 'paste', label: 'Tempel', enabled: p.editFlags.canPaste },
        { type: 'separator' },
        { role: 'selectAll', label: 'Pilih Semua' },
      );
    } else if (p.selectionText.trim()) {
      items.push({ role: 'copy', label: 'Salin' });
    }
    if (p.mediaType === 'image' && p.srcURL && !p.srcURL.startsWith('data:')) {
      sep();
      items.push(
        { label: 'Simpan Gambar…', click: () => wc.downloadURL(downloadUrl(p.srcURL)) },
        { label: 'Salin Gambar', click: () => wc.copyImageAt(p.x, p.y) },
      );
    }
    if (p.mediaType === 'video' && p.srcURL) {
      sep();
      items.push({ label: 'Simpan Video…', click: () => wc.downloadURL(downloadUrl(p.srcURL)) });
    }
    if (p.linkURL && /^(https?|mailto):/i.test(p.linkURL)) {
      sep();
      items.push(
        { label: 'Buka Link di Browser', click: () => shell.openExternal(p.linkURL) },
        { label: 'Salin Alamat Link', click: () => clipboard.writeText(p.linkURL) },
      );
    }
    if (items.length) Menu.buildFromTemplate(items).popup({ window: win });
  });

  // Hanya chat.jekardah.com (dan login Google) yang dibuka di dalam aplikasi; link lain ke browser
  wc.on('will-navigate', (e, url) => {
    if (isAppUrl(url) || isGoogleUrl(url)) return;
    e.preventDefault();
    if (/^(https?|mailto):/i.test(url)) shell.openExternal(url);
  });
  wc.setWindowOpenHandler(({ url }) => {
    if (isGoogleUrl(url)) {
      // Popup "Login dengan Google"
      return {
        action: 'allow',
        overrideBrowserWindowOptions: { width: 500, height: 680, parent: win, modal: false, autoHideMenuBar: true },
      };
    }
    if (isAppUrl(url) && url.includes('/api/media/')) {
      // PDF / dokumen dari chat dibuka di jendela aplikasi (butuh sesi login)
      return { action: 'allow', overrideBrowserWindowOptions: { width: 900, height: 1000, parent: win } };
    }
    if (/^(https?|mailto):/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // Tidak bisa terhubung (offline / server sibuk): tampilkan halaman coba lagi
  wc.on('did-fail-load', (e, code, desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return; // -3 = dibatalkan (mis. navigasi baru)
    win.loadFile(path.join(__dirname, 'offline.html'), { query: { url: APP_URL } });
  });

  if (SNAPSHOT) {
    wc.once('did-finish-load', () => {
      setTimeout(async () => {
        const img = await wc.capturePage();
        fs.writeFileSync(SNAPSHOT, img.toPNG());
        quitting = true;
        app.quit();
      }, Number(process.env.JEKARDAH_SNAPSHOT_DELAY || 4000));
    });
  }

  win.loadURL(APP_URL);
}

/** File chat diunduh dengan nama rapi dari server (?download=1). */
function downloadUrl(src) {
  const u = new URL(src);
  u.hash = '';
  if (isAppUrl(u.href) && u.pathname.startsWith('/api/media/')) u.searchParams.set('download', '1');
  return u.href;
}

// ---------- Unduhan: dialog "Simpan" ke folder Downloads ----------
function setupDownloads() {
  session.defaultSession.on('will-download', (e, item) => {
    item.setSaveDialogOptions({
      title: 'Simpan file',
      defaultPath: path.join(app.getPath('downloads'), item.getFilename()),
      buttonLabel: 'Simpan',
    });
    item.once('done', (ev, state) => {
      if (state !== 'completed') return;
      if (IS_MAC) app.dock?.downloadFinished(item.getSavePath()); // folder Downloads di Dock memantul
      win?.webContents.executeJavaScript(`window.jekardahToast?.(${JSON.stringify(`Tersimpan: ${path.basename(item.getSavePath())}`)})`).catch(() => {});
    });
  });
}

// ---------- Pemberitahuan versi baru aplikasi desktop ----------
// Tampilan & fitur chat selalu terbaru (dimuat dari chat.jekardah.com); yang perlu diunduh ulang hanya
// pembungkus aplikasinya, mis. perbaikan untuk Mac/Windows. Dicek saat aplikasi dibuka lalu setiap 6 jam.
const isNewer = (a, b) => {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
};
let skippedVersion = null;

async function latestRelease() {
  const res = await net.fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'jekardah-chat-desktop' } });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  const rel = await res.json();
  const version = String(rel.tag_name || '').replace(/^v/, '');
  // File untuk komputer ini: .dmg sesuai chip Mac, atau installer .exe Windows
  const asset = (rel.assets || []).find((a) => (IS_MAC ? a.name.endsWith(`-${process.arch}.dmg`) : IS_WIN ? a.name.endsWith('.exe') : false));
  return { version, url: asset?.browser_download_url || rel.html_url || RELEASES_PAGE, notes: String(rel.body || '') };
}

async function checkForUpdate({ manual = false } = {}) {
  try {
    const { version, url } = await latestRelease();
    const current = app.getVersion();
    if (!isNewer(version, current)) {
      if (manual) await dialog.showMessageBox(win, { type: 'info', message: 'Jekardah Chat sudah versi terbaru', detail: `Versi ${current}`, buttons: ['OK'] });
      return;
    }
    if (!manual && skippedVersion === version) return;
    const { response } = await dialog.showMessageBox(win, {
      type: 'info',
      title: 'Versi baru tersedia',
      message: `Jekardah Chat ${version} sudah tersedia`,
      detail: `Anda memakai versi ${current}. Unduh lalu pasang versi baru untuk perbaikan terbaru aplikasi desktop.\n\nChat Anda tetap aman — tersimpan di server, bukan di aplikasi.`,
      buttons: ['Unduh sekarang', 'Nanti'],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) shell.openExternal(url);
    else skippedVersion = version;
  } catch (e) {
    if (manual) await dialog.showMessageBox(win, { type: 'warning', message: 'Tidak dapat memeriksa pembaruan', detail: 'Periksa koneksi internet lalu coba lagi.', buttons: ['OK'] });
  }
}

// ---------- Windows: ikon di system tray ----------
function setupTray() {
  if (!IS_WIN) return;
  tray = new Tray(nativeImage.createFromPath(asset('tray.png')).resize({ width: 16, height: 16 }));
  tray.setToolTip('Jekardah Chat');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Buka Jekardah Chat', click: showWindow },
    { type: 'separator' },
    { label: 'Keluar', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('click', showWindow);
}

// ---------- Izin: notifikasi, kamera, salin-tempel hanya untuk chat.jekardah.com ----------
function setupPermissions() {
  const allowed = new Set(['notifications', 'media', 'clipboard-sanitized-write', 'clipboard-read', 'fullscreen']);
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler(async (wc, permission, callback, details) => {
    const ok = isAppUrl(details.requestingUrl || wc.getURL()) && allowed.has(permission);
    if (!ok) return callback(false);
    if (permission === 'media' && process.platform === 'darwin') {
      const types = details.mediaTypes || [];
      if (types.includes('video') && !(await systemPreferences.askForMediaAccess('camera'))) return callback(false);
      if (types.includes('audio') && !(await systemPreferences.askForMediaAccess('microphone'))) return callback(false);
    }
    callback(true);
  });
  ses.setPermissionCheckHandler((wc, permission, origin) => isAppUrl(origin) && allowed.has(permission));
}

// ---------- Menu macOS (penting untuk Cmd+C / Cmd+V / Cmd+Q) ----------
function setupMenu() {
  const appMenu = IS_MAC
    ? [{
      label: app.name,
      submenu: [
        { role: 'about', label: 'Tentang Jekardah Chat' },
        { label: 'Periksa Pembaruan…', click: () => checkForUpdate({ manual: true }) },
        { type: 'separator' },
        { role: 'hide', label: 'Sembunyikan Jekardah Chat' },
        { role: 'hideOthers', label: 'Sembunyikan Lainnya' },
        { role: 'unhide', label: 'Tampilkan Semua' },
        { type: 'separator' },
        { role: 'quit', label: 'Keluar dari Jekardah Chat' },
      ],
    }]
    : [{
      label: 'Berkas',
      submenu: [
        { label: 'Sembunyikan ke tray', accelerator: 'Ctrl+W', click: () => win?.hide() },
        { label: 'Keluar', accelerator: 'Ctrl+Q', click: () => { quitting = true; app.quit(); } },
      ],
    }];
  const template = [
    ...appMenu,
    {
      label: 'Edit',
      submenu: [
        { role: 'undo', label: 'Urungkan' },
        { role: 'redo', label: 'Ulangi' },
        { type: 'separator' },
        { role: 'cut', label: 'Potong' },
        { role: 'copy', label: 'Salin' },
        { role: 'paste', label: 'Tempel' },
        { role: 'selectAll', label: 'Pilih Semua' },
      ],
    },
    {
      label: 'Tampilan',
      submenu: [
        { role: 'reload', label: 'Muat Ulang' },
        { role: 'forceReload', label: 'Muat Ulang Paksa' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Ukuran Asli' },
        { role: 'zoomIn', label: 'Perbesar' },
        { role: 'zoomOut', label: 'Perkecil' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Layar Penuh' },
        { role: 'toggleDevTools', label: 'Alat Pengembang' },
      ],
    },
    {
      label: 'Jendela',
      submenu: [
        { role: 'minimize', label: 'Perkecil' },
        { role: 'zoom', label: 'Zoom' },
        { type: 'separator' },
        { label: 'Jekardah Chat', accelerator: 'CmdOrCtrl+0', click: showWindow },
        { role: 'close', label: 'Tutup Jendela' },
      ],
    },
    {
      label: 'Bantuan',
      submenu: [
        { label: 'Buka chat.jekardah.com di Browser', click: () => shell.openExternal(APP_URL) },
        { label: 'Halaman Unduhan & Versi Terbaru', click: () => shell.openExternal('https://github.com/romizone/jekardah-chat-desktop/releases/latest') },
        ...(IS_MAC ? [] : [
          { type: 'separator' },
          { label: 'Periksa Pembaruan…', click: () => checkForUpdate({ manual: true }) },
          { label: 'Tentang Jekardah Chat', click: () => app.showAboutPanel() },
        ]),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

ipcMain.handle('jekardah:version', () => app.getVersion());

app.setAboutPanelOptions({
  applicationName: 'Jekardah Chat',
  applicationVersion: app.getVersion(),
  copyright: 'Chat dengan email Gmail — chat.jekardah.com',
});

app.whenReady().then(async () => {
  if (UPDATE_PROBE) {
    // Uji: bandingkan versi rilis terbaru di GitHub dengan versi yang dipura-purakan
    const r = await latestRelease().catch((e) => ({ error: e.message }));
    console.log('UPDATE_PROBE', JSON.stringify({ current: UPDATE_PROBE, ...r, newer: r.version ? isNewer(r.version, UPDATE_PROBE) : null }));
    app.exit(0);
    return;
  }
  setupPermissions();
  setupDownloads();
  setupMenu();
  setupTray();
  createWindow();
  app.on('activate', showWindow); // klik ikon di Dock
  if (!SNAPSHOT) {
    setTimeout(() => checkForUpdate(), 15_000);
    setInterval(() => checkForUpdate(), 6 * 3600 * 1000);
  }
});

app.on('before-quit', () => {
  quitting = true;
  saveBounds();
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
