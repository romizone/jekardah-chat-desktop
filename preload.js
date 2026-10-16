// Memberi tahu halaman web bahwa ia berjalan di aplikasi desktop (mis. untuk menyembunyikan link unduhan).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jekardahDesktop', {
  platform: process.platform,
  version: () => ipcRenderer.invoke('jekardah:version'),
});
