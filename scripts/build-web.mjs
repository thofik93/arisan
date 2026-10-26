// Menyalin halaman game ke www/, folder yang dibungkus Capacitor jadi aplikasi.
// index.html di root tetap sumber utama, dan juga dipakai GitHub Pages.
import { cpSync, mkdirSync, rmSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const www = new URL('www/', root);

rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });
for (const file of ['index.html', 'privacy.html', 'sponsors.json', 'brain.json', 'og.png']) cpSync(new URL(file, root), new URL(file, www));
// versi web untuk portal gamewarga.com: disajikan dari jalur /siapayangnilep/
const web = new URL('dist-web/siapayangnilep/', root);
rmSync(new URL('dist-web/', root), { recursive: true, force: true });
mkdirSync(web, { recursive: true });
for (const file of ['index.html', 'privacy.html', 'sponsors.json', 'brain.json', 'og.png']) cpSync(new URL(file, root), new URL(file, web));
console.log('www/ dan dist-web/siapayangnilep/ siap.');
