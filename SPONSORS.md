# Cara memasang sponsor

Sponsor diatur lewat satu file, `sponsors.json`. Game web dan aplikasi Android/iOS membaca file ini dari `https://thofik93.github.io/arisan/sponsors.json` setiap kali dibuka. Jadi sponsor bisa ditambah, diganti, atau dihentikan cukup dengan mengubah file ini lalu push ke GitHub, tanpa rilis ulang aplikasi. Kalau pemain sedang offline, game memakai daftar terakhir yang tersimpan.

## Slot yang tersedia

Sponsor hanya ditempatkan di momen positif. Nama brand tidak pernah muncul di petunjuk tentang bandar, seperti paket COD, CCTV, atau sandal, supaya brand tidak ikut terasosiasi dengan pencuri kas. Setiap kemunculan diberi label **Sponsor**.

| Slot | Tampil di | Isi |
|---|---|---|
| `hijab` | Lemari: kerudung edisi brand, gratis untuk pemain | `name`, `color` (hex, misalnya `#9b7fd1`), `pattern` (`"batik"` atau kosong) |
| `kocokan` | Kartu kocokan arisan setelah permainan | `text`, `prize` (teks promo) |
| `harian` | Tombol Arisan Harian di beranda | `text` |
| `kue` | Di hari pertama, salah satu ibu membawa kue dari brand itu di grup chat | `item` (misalnya `"risol mayo"`) |

## Contoh

```json
{
  "version": 1,
  "sponsors": [
    {
      "id": "katering-sari",
      "brand": "Katering Bu Sari",
      "link": "https://contoh-katering.id/promo",
      "start": "2026-12-01",
      "end": "2026-12-31",
      "slots": {
        "kue": { "item": "risol mayo" },
        "kocokan": { "text": "Kocokan hari ini dipersembahkan oleh Katering Bu Sari.", "prize": "Diskon 15% untuk pesanan pertama" }
      }
    }
  ]
}
```

- `start` dan `end` (format `YYYY-MM-DD`) bersifat opsional. Di luar rentang itu, sponsor otomatis tidak tampil.
- `link` harus diawali `https://`. Link dibuka di browser, di luar game.
- Satu sponsor boleh memakai beberapa slot sekaligus. Kalau ada beberapa sponsor untuk slot yang sama, yang tampil dipilih acak.
- Teks dipotong otomatis supaya tidak merusak tampilan (nama brand maksimal 40 karakter, teks maksimal 120 karakter).

## Melihat tampilan contoh

Buka https://thofik93.github.io/arisan/#sponsordemo untuk melihat semua slot terisi brand fiktif. Mode ini hanya untuk pratinjau dan menunjukkan contoh ke calon sponsor. Pemain biasa tidak melihatnya.

## Kategori yang tidak diterima

Pinjol, judi, rokok, alkohol, produk keuangan yang tidak terdaftar di OJK, dan apa pun yang tidak pantas dimainkan semua umur.
