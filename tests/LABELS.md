# Pedoman label korpus pemahaman pesan

Setiap kalimat diberi satu label `maksud@orang/jenis:nilai`. Pedoman yang sama dipakai untuk menilai aturan, model kata, dan LLM.

| Label | Kapan dipakai |
|---|---|
| `accuse@X` | Menyatakan atau menyiratkan X bandar, berbohong, mencurigakan, atau mengajak mengeluarkan X |
| `defend@X` | Menyatakan X bersih atau bisa dipercaya, atau meminta X jangan dikeluarkan atau dituduh |
| `deny@X` | Membela diri sendiri dari tuduhan. X = orang yang menuduh dan sedang dijawab (dari sapaan atau konteks). Tanpa X kalau penuduhnya tidak jelas |
| `swear@X` | Seperti `deny`, tapi dengan sumpah (demi Allah, sumpah) |
| `report@X:+` / `report@X:-` | Mengaku melihat X keluar rumah / di rumah semalam |
| `claimBend@X:+` / `claimBend@X:-` | Mengaku Bendahara dengan hasil audit X: bandar / bersih |
| `claimGosip@X:+` / `claimGosip@X:-` | Mengaku Ratu Gosip atau mendengar kabar soal X: buruk / baik ("biasa aja", "gak ada apa-apa") |
| `claimRole` | Mengaku peran tanpa hasil (aku warga biasa, aku Bendahara) |
| `ask@X/alibi` | Bertanya ke X semalam ke mana atau ngapain |
| `ask@X/why` | Bertanya ke X kenapa menuduh atau apa buktinya |
| `ask@X/role` | Bertanya peran X |
| `ask@X/opinion` | Bertanya pendapat X soal siapa bandarnya |
| `ask@X/about` | Bertanya apakah X sendiri bandar |
| `ask/callRole` | Meminta Bendahara (atau peran lain) mengaku |
| `question` | Bertanya ke semua orang siapa bandarnya |
| `greet`, `laugh`, `thanks@X`, `angry`, `cry` | Salam, tertawa, terima kasih, marah tanpa sasaran jelas, sedih |
| `chat` | Tidak bermakna untuk permainan |

Aturan khusus:
- **Membalas penuduh.** Kalau X baru saja menuduhku, lalu aku membantah tanpa menyebut X bandar atau pembohong ("jangan ngarang", "jangan bawa masalah pribadi"), labelnya `deny@X`. Kalau aku menyebut X bandar, pembohong, atau Bendahara palsu, labelnya `accuse@X`.
- **Sapaan dan yang dibicarakan.** Nama di awal kalimat yang diikuti teguran ("Bu Sri, jangan …") berarti Bu Sri yang ditegur, bukan dibela. "Jangan tuduh Bu Sri" berarti membela Bu Sri.
- **Dua sikap dalam satu kalimat**: label diambil dari tuduhan, karena tuduhan paling menentukan voting.

Konteks ditulis sebagai daftar pesan bot sebelumnya: `[pengirim, jenis, sasaran, nilai]`, dengan `ME` = pemain.
