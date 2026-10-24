// Menyalin halaman game ke www/, folder yang dibungkus Capacitor jadi aplikasi.
// index.html di root tetap sumber utama, dan juga dipakai GitHub Pages.
import { cpSync, mkdirSync, rmSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const www = new URL('www/', root);

rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });
for (const file of ['index.html', 'privacy.html']) cpSync(new URL(file, root), new URL(file, www));
console.log('www/ siap.');
