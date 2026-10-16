// Merender ikon aplikasi (SVG) menjadi PNG 1024×1024 memakai Electron. Jalankan: npx electron scripts/make-icon.js
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#5B90E6"/><stop offset="1" stop-color="#2556BC"/>
    </linearGradient>
    <linearGradient id="at" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#467DDB"/><stop offset="1" stop-color="#2556BC"/>
    </linearGradient>
    <filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="14" stdDeviation="18" flood-color="#0f2a63" flood-opacity=".28"/></filter>
    <filter id="sh2" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#14306b" flood-opacity=".30"/></filter>
  </defs>
  <rect x="100" y="100" width="824" height="824" rx="186" fill="url(#bg)" filter="url(#sh)"/>
  <g transform="translate(512 500) scale(8.6) translate(-32 -32)" filter="url(#sh2)">
    <path fill="#fff" d="M32 4C16.5 4 4 15.9 4 30.6c0 7.6 3.4 14.5 8.9 19.3L10 60l11.3-5.6c3.3 1.1 6.9 1.8 10.7 1.8 15.5 0 28-11.9 28-26.6S47.5 4 32 4z"/>
  </g>
  <text x="512" y="612" text-anchor="middle" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="330" font-weight="800" fill="url(#at)">@</text>
</svg>`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1024, height: 1024, show: false, frame: false, transparent: true, webPreferences: { offscreen: true } });
  await win.loadURL(`data:text/html,${encodeURIComponent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`)}`);
  await new Promise((r) => setTimeout(r, 400));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 });
  const out = path.join(__dirname, '..', 'build', 'icon-1024.png');
  fs.writeFileSync(out, img.resize({ width: 1024, height: 1024 }).toPNG());
  fs.writeFileSync(path.join(__dirname, '..', 'build', 'icon.png'), img.resize({ width: 1024, height: 1024 }).toPNG());
  fs.writeFileSync(path.join(__dirname, '..', 'build', 'icon.svg'), svg);
  console.log('ikon 1024 px:', out);

  // Ikon tray Windows & penanda "ada pesan belum dibaca" di taskbar
  const render = async (html, size, file) => {
    const w = new BrowserWindow({ width: size, height: size, show: false, frame: false, transparent: true, webPreferences: { offscreen: true } });
    await w.loadURL(`data:text/html,${encodeURIComponent(`<html><body style="margin:0;background:transparent">${html}</body></html>`)}`);
    await new Promise((r) => setTimeout(r, 300));
    const shot = await w.webContents.capturePage({ x: 0, y: 0, width: size, height: size });
    fs.writeFileSync(path.join(__dirname, '..', 'build', file), shot.resize({ width: size, height: size }).toPNG());
    w.destroy();
  };
  await render(svg.replace('width="1024" height="1024"', 'width="64" height="64"'), 64, 'tray.png');
  await render('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="14" fill="#467DDB" stroke="#fff" stroke-width="3"/></svg>', 32, 'badge.png');
  console.log('tray.png & badge.png siap');
  app.quit();
});
