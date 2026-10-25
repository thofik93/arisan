# Bot yang belajar dari pemain

Bot ARISAN makin pintar dari catatan permainan pemain yang setuju berbagi data. Alurnya:

```
game (izin pemain) ──POST──▶ server Cloudflare (D1) ──ekspor──▶ GitHub Actions mingguan
      ▲                                                               │ latih + uji
      └──────────── brain.json di GitHub Pages ◀── PR kamu setujui ◀──┘
```

## 1. Yang dicatat game
Hanya kalau pemain menekan **Ya, bantu** di akhir permainan pertamanya. Bisa dimatikan di menu ⋯ → Bantu bot belajar.

- Hasil permainan, peran, voting, dan jenis pesan bot (bukan teksnya).
- Pesan yang diketik pemain, sudah dirapikan dan **disamarkan**: nama anggota jadi `<p3>`, nama pemain jadi `<me>`, angka panjang jadi `<num>`. Maksimal 200 karakter.
- Tebakan maksud dari aturan (`l`), keyakinannya (`c`), waktu kirim (`ts`), dan tiga pesan bot terakhir sebagai konteks (`cx`).

Tidak ada akun, ID perangkat, atau IP. Server menyimpan hash IP per jam hanya untuk membatasi spam (30 kiriman per jam), lalu menghapusnya setelah 2 hari. Catatan dihapus otomatis setelah setahun.

## 2. Server (`server/`)
Cloudflare Worker dengan database D1.

| Endpoint | Fungsi |
|---|---|
| `POST /v1/games` | Menerima catatan dari game. Divalidasi ketat; field yang tidak dikenal dibuang. |
| `GET /v1/export?after=ID` | JSONL untuk pelatihan. Wajib `Authorization: Bearer <ADMIN_TOKEN>`. |
| `GET /v1/stats` | Jumlah permainan. Wajib token admin. |
| `POST /v1/teach` | Menjalankan guru otomatis sekarang (biasanya otomatis setiap jam). Wajib token admin. |

Pasang pertama kali:
```bash
cd server
npx wrangler@4.152.0 login
npx wrangler@4.152.0 d1 create arisan          # salin database_id ke wrangler.toml
npx wrangler@4.152.0 d1 execute arisan --remote --file schema.sql
npx wrangler@4.152.0 secret put ADMIN_TOKEN     # token panjang acak
npx wrangler@4.152.0 secret put SALT            # teks acak lain
npx wrangler@4.152.0 deploy
```
Lalu isi `LEARN_API` di `index.html` dengan alamat worker, dan tambahkan secret repo `LEARN_API` serta `LEARN_ADMIN_TOKEN`.

## 3. Pelatihan (`scripts/train.mjs`)
Setiap Senin 02.00 WIB, `.github/workflows/learn.yml` mengunduh data, melatih, menguji, lalu membuka PR.

Bot belajar **tanpa koreksi manual**. Setiap pesan diberi label dari sumber paling tepercaya yang tersedia:

| Sumber | Bobot | Artinya |
|---|---|---|
| **Guru otomatis** (`tl`) | 2 | Setiap jam, server meminta LLM di Cloudflare Workers AI (Qwen3 30B, cadangan Llama 3.3 70B) memberi label pada pesan yang membuat aturan ragu, ditambah audit acak sekitar 10% pesan yang dibaca aturan dengan yakin (supaya salah baca yang percaya diri ikut ketahuan). Nama diganti samaran Bu A, Bu B, …, dan peran rahasia tidak pernah dikirim. Maksimal 40 pesan per jam |
| **Pesan susulan** | 1,5 | Pesan ragu yang langsung disusul (≤ 60 detik) pesan yang jelas soal orang yang sama: maksudnya mengikuti pesan susulan |
| **Voting** | 1,5 | Pemain menyebut X, aturan membacanya "membela" atau tidak paham, lalu pemain memilih X: pesannya bermusuhan dengan X |
| Tebakan aturan yang yakin | 1 | Keyakinan ≥ 0,8 |

Pilihan pemain dari versi lama ("Maksudmu?", bobot 3) tetap dipakai kalau ada di data lama.

- **Model kata (naive Bayes)** dilatih dari label-label itu. Model dipakai saat aturan tidak menangkap maksud pesan (presisi minimal 90% pada data uji), dan boleh mengalahkan tebakan aturan yang lemah kalau terbukti lebih tepat. Butuh minimal 200 contoh.
- **Gelagat**: membandingkan perilaku pemain manusia saat jadi bandar dan saat jadi warga (diam, menyangkal, menuduh, bertanya, mengaku Bendahara). Sebelum voting, bot menyesuaikan kecurigaannya terhadap pemain dengan pengali yang dibatasi 0,6–1,6.
- **Tingkat salah paham** adalah ukuran utama apakah bot makin pintar: persentase pesan pemain yang tidak dipahami aturan, atau yang tebakan aturannya dibantah guru otomatis, voting, atau pesan susulan. Semuanya terdeteksi otomatis. Patokannya di bawah 10%. Laporan mingguan menampilkan angka minggu ini, tren dibanding minggu lalu, riwayat 12 minggu (disimpan di `brain.json`), jenis koreksi terbanyak, dan kata yang sering muncul di pesan yang gagal dipahami (hanya kata yang dipakai minimal 10 kali, tanpa teks utuh) sebagai bahan aturan baru.
- **Gerbang uji**: `tests/nlu.mjs` menjalankan 194 kalimat pengembangan (wajib benar semua) dan 150 kalimat set uji tertutup (skornya tidak boleh turun dari `tests/holdout-baseline.json`) dengan otak baru. Kalau gagal, PR tidak dibuat.

Model yang dilatih sendiri dari tebakannya tidak dipakai lagi untuk latihan, supaya kesalahannya tidak makin menguat.

## 4. Game memakai otak baru
Game mengunduh `brain.json` dari GitHub Pages setiap dibuka (seperti `sponsors.json`), jadi bot di web, Android, dan iOS ikut pintar tanpa rilis ulang. Isi file divalidasi dan dibatasi; file yang rusak diabaikan.

## Menganalisis data sendiri
```bash
LEARN_API=https://... ADMIN_TOKEN=... node scripts/fetch-data.mjs data/export.jsonl
node scripts/train.mjs data/export.jsonl   # menulis brain.json dan learning-report.md
```
Folder `data/` tidak pernah di-commit. Repo ini publik.
