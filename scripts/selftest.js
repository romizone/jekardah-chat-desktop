// Uji otomatis aplikasi desktop terhadap server LOKAL (npm run dev dengan DEV_LOGIN=1).
// Jalankan: npm run selftest   (menyiapkan data lewat scripts/selftest-seed.mjs lalu membuka aplikasi)
// Data aplikasi memakai folder sementara; sesi login asli tidak tersentuh.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { shell, BrowserWindow, session } = require('electron');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = async ({ app, getWin, showWindow, fitBounds }) => {
  const { conv, a } = JSON.parse(process.env.JEKARDAH_SELFTEST_DATA || '{}');
  const base = (process.env.JEKARDAH_URL || '').replace(/\/$/, '');
  const results = [];
  const ok = (cond, name, extra = '') => {
    results.push({ ok: !!cond, name, extra });
    console.log(`${cond ? 'ok   ' : 'GAGAL'} - ${name}${extra ? `  [${extra}]` : ''}`);
  };
  const finish = () => {
    const failed = results.filter((r) => !r.ok).length;
    console.log(failed ? `\n${failed} dari ${results.length} uji GAGAL` : `\nSemua ${results.length} uji desktop lolos ✔`);
    try { fs.rmSync(app.getPath('userData'), { recursive: true, force: true }); } catch { /* abaikan */ }
    app.exit(failed ? 1 : 0);
  };
  // Pengaman: uji tidak boleh menggantung
  setTimeout(() => { ok(false, 'uji melewati batas waktu 150 detik'); finish(); }, 150_000).unref();
  const withTimeout = (p, ms, label) => Promise.race([p, sleep(ms).then(() => { throw new Error(`${label}: tidak ada jawaban ${ms} ms`); })]);

  // Link luar tidak benar-benar dibuka di browser selama uji
  const opened = [];
  shell.openExternal = async (url) => { opened.push(url); };
  const until = async (fn, ms = 6000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await withTimeout(Promise.resolve(fn()), 2000, 'cek').catch(() => false)) return true;
      await sleep(100);
    }
    return false;
  };

  await app.whenReady();
  await until(() => getWin()?.webContents && !getWin().webContents.isLoading(), 15000);
  const win = getWin();
  const wc = win.webContents;
  const js = (code) => withTimeout(wc.executeJavaScript(code, true), 10_000, 'skrip halaman');

  const dlDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jekardah-dl-'));
  const downloads = [];
  session.defaultSession.on('will-download', (e, item) => {
    item.setSavePath(path.join(dlDir, item.getFilename())); // tanpa dialog selama uji
    item.once('done', (ev, state) => downloads.push({ name: item.getFilename(), state }));
  });
  const children = () => BrowserWindow.getAllWindows().filter((w) => w !== win && !w.isDestroyed());
  const closeChildren = () => children().forEach((w) => w.destroy());

  try {
    // ---- Login akun uji & buka percakapan ----
    const loginStatus = await js(`fetch('/api/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: ${JSON.stringify(a)} }) }).then((r) => String(r.status))`);
    if (!loginStatus.startsWith('200')) throw new Error(`login uji gagal: ${loginStatus}`);
    await wc.loadURL(`${base}/?selftest=${Date.now()}#c${conv}`);
    const loaded = await until(() => js(`!!document.querySelector('.doc-card')`).catch(() => false), 15000);
    const state = await js(`({ url: location.href, login: !document.querySelector('#login')?.classList.contains('hidden'), rows: document.querySelectorAll('.msg-row').length, me: document.cookie.length })`).catch((e) => e.message);
    ok(loaded, 'chat terbuka setelah login', loaded ? '' : JSON.stringify(state));
    if (!loaded) throw new Error('chat tidak terbuka');

    // ---- Link di pesan → browser, bukan jendela aplikasi ----
    opened.length = 0;
    await js(`document.querySelector('.bubble .text a[href*="example.com"]').click()`);
    await until(() => opened.length);
    ok(opened[0]?.startsWith('https://example.com/halo') && !children().length, 'link di pesan dibuka di browser', opened[0] || '-');

    // ---- Navigasi halaman utama ke situs lain diblokir → browser ----
    opened.length = 0;
    await js(`location.href = 'https://example.org/luar'`);
    await until(() => opened.length);
    ok(opened[0] === 'https://example.org/luar' && wc.getURL().startsWith(base), 'pindah ke situs lain dibuka di browser, aplikasi tetap di chat');

    // ---- mailto ----
    opened.length = 0;
    await js(`window.open('mailto:teman@gmail.com?subject=Halo')`);
    await until(() => opened.length);
    ok(opened[0]?.startsWith('mailto:teman@gmail.com'), 'link email (mailto) dibuka di aplikasi email');

    // ---- PDF dibuka di jendela penampil ----
    await js(`[...document.querySelectorAll('.doc-card')].find((c) => c.textContent.includes('laporan.pdf')).click()`);
    await until(() => children().length);
    const pdfWin = children()[0];
    if (pdfWin) await until(() => !pdfWin.webContents.isLoading(), 8000);
    await sleep(1500);
    // Penampil PDF Chromium berjalan sebagai frame ekstensi di dalam jendela
    const frames = pdfWin ? pdfWin.webContents.mainFrame.framesInSubtree.map((f) => f.url) : [];
    const viewer = frames.some((u) => u.startsWith('chrome-extension://'));
    if (pdfWin && process.env.JEKARDAH_SELFTEST_SHOT) fs.writeFileSync(process.env.JEKARDAH_SELFTEST_SHOT, (await pdfWin.webContents.capturePage()).toPNG());
    ok(pdfWin && viewer, 'PDF tampil di jendela penampil', JSON.stringify(frames.map((u) => u.slice(0, 60))));
    closeChildren();

    // ---- Dokumen lain (txt) diunduh, tanpa jendela kosong tertinggal ----
    downloads.length = 0;
    await js(`[...document.querySelectorAll('.doc-card')].find((c) => c.textContent.includes('catatan.txt')).click()`);
    await until(() => downloads.length, 8000);
    await sleep(800);
    ok(downloads[0]?.name === 'catatan.txt' && downloads[0].state === 'completed', 'dokumen (txt) terunduh', JSON.stringify(downloads[0] || null));
    ok(!children().length, 'tidak ada jendela kosong tertinggal setelah unduh', `${children().length} jendela`);
    closeChildren();

    // ---- Tombol unduh dokumen ----
    downloads.length = 0;
    await js(`[...document.querySelectorAll('.doc-card')].find((c) => c.textContent.includes('laporan.pdf')).querySelector('.doc-dl').click()`);
    await until(() => downloads.length, 8000);
    ok(downloads[0]?.name === 'laporan.pdf' && wc.getURL().startsWith(base) && !children().length, 'tombol unduh PDF menyimpan file, chat tetap terbuka');

    // ---- Unduh foto lewat menu pesan ----
    downloads.length = 0;
    await js(`(() => {
      const img = document.querySelector('.msg-img');
      const r = img.getBoundingClientRect();
      img.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 5, clientY: r.top + 5 }));
      document.querySelector('#msgMenu [data-act="download"]').click();
    })()`);
    await until(() => downloads.length, 8000);
    ok(/^Jekardah-Foto-.*\.png$/.test(downloads[0]?.name || '') && downloads[0].state === 'completed', 'unduh foto dari menu pesan', downloads[0]?.name || '-');

    // ---- Badge belum dibaca ----
    await js(`document.title = '(4) Jekardah Chat'`);
    await sleep(300);
    if (process.platform === 'darwin') ok(app.dock.getBadge() === '4', 'badge Dock mengikuti jumlah chat belum dibaca', app.dock.getBadge());
    else ok(win.getTitle() === '(4) Jekardah Chat', 'judul jendela memuat jumlah belum dibaca');
    await js(`document.title = 'Jekardah Chat'`);
    await sleep(300);
    if (process.platform === 'darwin') ok(app.dock.getBadge() === '', 'badge hilang saat semua sudah dibaca');

    // ---- Jendela ditutup → tetap berjalan, realtime tidak diperlambat ----
    win.close();
    await sleep(300);
    ok(!win.isDestroyed() && !win.isVisible(), 'menutup jendela = disembunyikan, aplikasi tetap berjalan');
    ok(wc.getBackgroundThrottling() === false, 'pesan tetap masuk realtime saat jendela tersembunyi (tanpa throttling)');

    // ---- Klik notifikasi memunculkan jendela ----
    await js(`window.jekardahDesktop?.show?.()`);
    await sleep(500);
    ok(win.isVisible(), 'klik notifikasi memunculkan jendela yang tersembunyi');
    showWindow();

    // ---- Posisi jendela di luar layar (monitor dilepas) dikembalikan ke layar ----
    if (fitBounds) {
      const b = fitBounds({ x: -6000, y: -6000, width: 1200, height: 800 });
      ok(b.x > -6000 && b.y > -6000, 'posisi jendela di luar layar dikembalikan ke layar', JSON.stringify(b));
    } else ok(false, 'posisi jendela di luar layar dikembalikan ke layar', 'tidak ada pengecekan');

    // ---- Server tidak bisa dihubungi → halaman offline ----
    await wc.loadURL('http://127.0.0.1:9/').catch(() => {});
    await until(() => wc.getURL().includes('offline.html'), 8000);
    ok(wc.getURL().includes('offline.html'), 'halaman "Tidak dapat terhubung" saat server tak terjangkau');
    await wc.loadURL(`${base}/?selftest=${Date.now()}#c${conv}`);
    await until(() => js(`!!document.querySelector('.doc-card')`).catch(() => false), 15000);

    // ---- Tampilan crash → dimuat ulang otomatis ----
    wc.forcefullyCrashRenderer();
    const recovered = await until(async () => !wc.isCrashed() && (await js(`!!document.querySelector('.msg-row')`).catch(() => false)), 15000);
    ok(recovered, 'tampilan yang crash dimuat ulang otomatis');
  } catch (e) {
    ok(false, 'uji berhenti karena error', e.stack || e.message);
  }

  fs.rmSync(dlDir, { recursive: true, force: true });
  finish();
};
