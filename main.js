// Jekardah Chat untuk macOS — membungkus https://chat.jekardah.com dalam jendela aplikasi sendiri.
const { app, BrowserWindow, Menu, shell, session, systemPreferences, nativeTheme, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const APP_URL = (process.env.JEKARDAH_URL || 'https://chat.jekardah.com').replace(/\/$/, '');
const APP_ORIGIN = new URL(APP_URL).origin;
const GOOGLE_HOSTS = ['accounts.google.com', 'accounts.youtube.com', 'ssl.gstatic.com', 'www.gstatic.com'];
const SNAPSHOT = process.env.JEKARDAH_SNAPSHOT; // khusus pengujian: simpan tangkapan layar lalu keluar

let win = null;
let quitting = false;
let lastBadge = 0;

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
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#111b21' : '#f0f2f5',
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

  // Menutup jendela = menyembunyikan (pesan & notifikasi tetap masuk), seperti WhatsApp di Mac
  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      win.hide();
    }
  });

  const wc = win.webContents;

  // Badge Dock dari judul halaman "(3) Jekardah Chat"
  wc.on('page-title-updated', (e, title) => {
    e.preventDefault();
    win.setTitle('Jekardah Chat');
    const n = Number((/^\((\d+)\)/.exec(title) || [])[1] || 0);
    app.dock?.setBadge(n ? String(n) : '');
    if (n > lastBadge && !win.isFocused()) app.dock?.bounce('informational');
    lastBadge = n;
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
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about', label: 'Tentang Jekardah Chat' },
        { type: 'separator' },
        { role: 'hide', label: 'Sembunyikan Jekardah Chat' },
        { role: 'hideOthers', label: 'Sembunyikan Lainnya' },
        { role: 'unhide', label: 'Tampilkan Semua' },
        { type: 'separator' },
        { role: 'quit', label: 'Keluar dari Jekardah Chat' },
      ],
    },
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

app.whenReady().then(() => {
  setupPermissions();
  setupMenu();
  createWindow();
  app.on('activate', showWindow); // klik ikon di Dock
});

app.on('before-quit', () => {
  quitting = true;
  saveBounds();
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
