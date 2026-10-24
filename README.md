# ARISAN

Game social deduction ala ibu-ibu arisan, untuk web, Android, dan iOS. Ada Bandar Bodong di grup arisan yang tiap malam menilep uang kas. Temukan dan keluarkan dia dari grup sebelum pertemuan terakhir.

**Main di browser:** https://thofik93.github.io/arisan/

## Mode main

- **Main sama ibu-ibu:** kamu dan 5–7 bot. Setiap bot punya kepribadian (julid, polos, bijak, sosialita, pendiam, kepo, baper, tegas) yang memengaruhi seberapa mudah dia percaya gosip, seberapa sering bicara, dan seberapa pandai berbohong saat jadi bandar.
- **Arisan Harian:** pembagian peran, bot, dan warna sandal sama untuk semua orang pada tanggal yang sama. Hasilnya bisa dibagikan dalam format singkat ala Wordle.
- **Main bareng, oper HP:** 4–8 orang di satu HP. HP dioper untuk melihat peran, aksi malam, dan voting rahasia. Diskusinya ngobrol langsung, dengan timer.

## Otak ARISAN

Ibu-ibu bot digerakkan oleh **Otak ARISAN**, model bahasa yang dibuat khusus untuk game ini. Model ini berjalan sepenuhnya di perangkat, tanpa internet, tanpa API key, dan tanpa biaya.

- **Pemahaman tulisan bebas:** pemain bisa mengetik apa saja. Otak ARISAN mengenali nama yang disebut (juga yang disingkat, misalnya "Siti"), niat (menuduh, membela, mengaku Bendahara, melapor, bertanya, bersumpah, marah, sedih), penyangkalan ("gak curiga", "bukan bandar"), dan akhiran kata ("bandarnya").
- **Penyusun kalimat:** kalimat dirangkai dari potongan inti, gaya bicara tiap kepribadian, dan emosi saat itu. Kalimat yang sudah dipakai dihindari dalam satu permainan.
- **Memori:** bot menyebut bukti nyata dari permainan yang sedang berjalan, misalnya siapa yang kemarin menuduh orang yang ternyata bersih, sandal yang cocok dengan petunjuk, atau siapa yang membela bandar.
- **Dendam dan pertemanan:** dituduh atau dipilih saat voting membuat bot menyimpan dendam, sehingga tuduhan dan suara mereka tidak selalu logis.
- **Strategi bandar** diacak setiap permainan: *kambing hitam*, *Bendahara palsu*, *diam-diam*, *ratu drama*, atau *bestie* (mendekati pemain).

### Drama

- **Alur sinetron:** setiap permainan ada sepasang musuh bebuyutan (saling sindir di hari pertama, lalu debat panjang sampai penonton memihak) dan sepasang besti (saling membela, tapi bisa berkhianat kalau salah satunya makin dicurigai).
- **Sidang sebelum voting:** dua orang yang paling dicurigai membela diri (termasuk kamu, kalau kamu tersangka), lalu seorang saksi membongkar bukti.
- **Voting dibuka satu per satu** dengan komentar setiap pemilih. Kalau seri, ada pembelaan terakhir lalu voting ulang di antara yang seri.
- **Kejutan harian:** pesan suara, rekaman CCTV warung, paket COD misterius, pengakuan palsu karena tertekan, dan rapat darurat yang memaksa ibu pendiam bicara.
- Narasi pagi ala sinetron dengan bunyi "jeng jeng", dan reaksi emoji di bawah pesan.
- Indikator suasana grup, dari Adem sampai Membara.
- Perdebatan dua ibu yang saling dendam, lalu ada yang menengahi.
- Curhat sambil menangis dari yang paling sering dituduh.
- Ngambek keluar grup setelah dituduh bertubi-tubi, lalu dimasukkan lagi oleh Bu RT.
- Salah kirim pesan yang langsung dihapus, tapi sudah sempat terbaca. Pesan dari bandar lebih sering mencurigakan.
- "Screenshot" bukti saat ada dua orang mengaku Bendahara, atau klaim yang terbukti bohong.
- Kata-kata terakhir sebelum dikeluarkan, jeda menegangkan sebelum peran dibuka, lalu reaksi ibu-ibu lain.

### Kenapa bukan LLM?

Ada dua jalur LLM, dan keduanya tidak cocok untuk versi ini:
- **LLM lewat API** (Claude dan sejenisnya) butuh server perantara untuk menyimpan API key, dan setiap permainan memakan biaya.
- **LLM lokal di HP** (misalnya Qwen atau Gemma lewat WebGPU) butuh unduhan sekitar 1 GB dan HP yang cukup baru. Balasannya juga bisa makan 5–20 detik per pesan, dan bahasa Indonesia model kecil masih kaku.

Otak ARISAN dirancang supaya nanti bisa disambungkan ke LLM sebagai pilihan tambahan, tanpa mengubah aturan game.

## Aturan

| Peran | Aksi malam |
|---|---|
| Bandar Bodong | Menilep kas otomatis, lalu mengajak satu orang ngerumpi: aksi orang itu gagal dan besok pagi dia difitnah. Selalu terlihat keluar rumah. |
| Bendahara | Mengaudit satu orang dan tahu pasti apakah dia bandar. |
| Bu RT | Menjaga satu orang. Ajakan ngerumpi ke orang itu ditolak dan fitnahnya diklarifikasi. Bu RT sendiri tidak bisa diajak ngerumpi. |
| Ratu Gosip | Mencari kabar tentang satu orang. Benar 65% dari waktu. |
| Warga | Mengintip satu rumah. Orang yang keluar hanya terlihat 60% dari waktu. |

- Pagi hari ada kabar: kas berkurang, fitnah dari bandar, dan kadang petunjuk sungguhan berupa warna sandal orang yang terlihat di dekat kotak kas.
- Diskusi, lalu voting. Suara terbanyak dikeluarkan dan perannya dibuka. Kalau seri, tidak ada yang keluar.
- Warga menang kalau semua bandar keluar. Bandar menang kalau masih di grup setelah voting pertemuan ke-3, atau jumlahnya menyamai warga.
- Jumlah bandar: 1 untuk 4–5 pemain, 2 untuk 6–8 pemain.

## Keseimbangan

Angka-angka aturan ada di objek `TUNE` di `index.html`, dan disetel lewat simulasi ribuan permainan yang semua pemainnya bot. Di konsol browser bisa dicoba dengan `ArisanSim.simulate(1000, 6)`.

| Pemain | Warga menang (simulasi semua-bot) |
|---|---|
| 6 | ±58% |
| 7 | ±64% |
| 8 | ±65% |

Untuk 4–5 pemain (hanya di mode oper HP), simulasi bot masih menguntungkan warga (±84–92%). Itu karena bot jauh lebih sistematis daripada manusia yang sedang ngobrol santai. Perlu diuji dengan pemain sungguhan.

## Yang membuat orang ingin kembali

- Satu permainan sekitar 5 menit, dan peran selalu diacak.
- Arisan Harian dengan hasil yang bisa dibagikan, plus hitungan hari berturut-turut. Kalau terlewat, hitungannya mulai lagi tanpa ada yang hilang.
- Kocokan arisan setelah setiap permainan melawan bot. Peluangnya 1/jumlah pemain, ditambah 5% setiap kali belum menang, maksimal 50%. Hadiahnya kue. Peluang ditampilkan di beranda dan di layar kocokan.
- Enam pangkat, 10 prestasi, dan lemari kosmetik yang dibeli dengan kue.

Sengaja tidak ada: pembelian dengan uang sungguhan, loot box, sistem energi, atau notifikasi yang memaksa. Kue hanya bisa didapat dari bermain.

## Teknis

- `index.html`: seluruh game dalam satu file (HTML, CSS, JS) tanpa build dan tanpa dependensi. Progres disimpan di `localStorage`.
- `android/`, `ios/`: proyek native [Capacitor 7](https://capacitorjs.com).
- `privacy.html`: kebijakan privasi untuk toko aplikasi.
- `scripts/`: menyalin web ke `www/`, dan membuat gambar sumber ikon dan splash.

```bash
npm install
npm run sync          # perbarui proyek native setelah index.html berubah
npm run android:apk   # APK debug untuk dicoba di HP
npm run ios           # buka di Xcode
```

Langkah rilis ke Play Store dan App Store ada di [RELEASE.md](RELEASE.md), dan teks listing toko ada di [STORE.md](STORE.md).
