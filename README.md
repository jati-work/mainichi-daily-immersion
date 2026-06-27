# 🌿 Jurnal Immersion Harian (versi web app)

Versi React + Supabase dari Jurnal Immersion Harian kamu. Panduan ini nuntun
dari nol: bikin Supabase, push ke GitHub, deploy ke Vercel.

App ini **gak pakai akun/email sama sekali** — cukup 1 kata sandi simpel
(default: `ganbatte`) buat masuk. Ini bukan keamanan kelas berat, cuma
nyaring orang random yang gak sengaja nemu link Vercel kamu.

## Yang udah ada di v1 ini
- Masuk pakai 1 kata sandi simpel (gak ada email/akun)
- Daftar paket: search, grouping per tanggal (collapsible), urutan manual (▲▼)
- Flashcard per paket (flip buka/tutup, tandai hafal)
- Tambah kata + **active recall**: kalau kata (kanji/kana) udah ada di paket
  manapun, sistem nahan dan kasih reminder "ayo inget-inget" (gak nampilin arti)
- Upload & lihat PDF per paket (panel full-screen, nutup flashcard pas dibuka)
- Jurnal Kalender (klik tanggal buat isi catatan, ada streak counter)

## Yang BELUM ada (next iteration, nyusul)
- Mode Tes (kuis tebak-tebakan)
- Random / Sembunyikan hafal / Hafal saja (filter tampilan kartu)
- Mode Edit & Mode Hapus kata (drag, klik kartu langsung)
- Bagian (sub-grup kata dalam satu paket)
- Cara Belajar & Fondasi (accordion edukasi)

---

## LANGKAH 1 — Bikin project Supabase

1. Buka [supabase.com](https://supabase.com), bikin akun (gratis), klik **New Project**.
2. Kasih nama (misal `mainichi-daily-immersion`), pilih region paling dekat (Singapore biasanya paling cepat dari Indonesia), bikin password database (ini password buat database doang, beda sama kata sandi app).
3. Tunggu sampai project siap (~2 menit).
4. Buka tab **SQL Editor** (ikon di sidebar kiri) → **New query**.
5. Copy-paste seluruh isi file `supabase/schema.sql` dari project ini → klik **Run**.
   Ini bikin tabel `paket`, `kata`, `jurnal`.
6. Buka tab **Storage** (sidebar kiri) → **New bucket**.
   - Nama: `immersion-pdfs`
   - **Jangan** dicentang "Public bucket" (biarin private).
   - Klik **Save**.
7. Buka **Project Settings → API Keys** (atau **Data API** di Integrations).
   - Copy **Project URL** (bentuknya `https://xxxxx.supabase.co`, JANGAN ikut `/rest/v1/`-nya)
   - Copy **Publishable key** (`sb_publishable_...`) — JANGAN yang Secret key.

## LANGKAH 2 — Push ke GitHub

1. Bikin repo baru di GitHub, **kosongin** (jangan kasih README otomatis).
2. Di komputer kamu, extract folder project ini, terus jalanin di terminal (folder project):
   ```bash
   git init
   git add .
   git commit -m "Initial commit: Jurnal Immersion Harian"
   git branch -M main
   git remote add origin https://github.com/USERNAME/NAMA-REPO.git
   git push -u origin main
   ```
   (Ganti `USERNAME` dan `NAMA-REPO` sesuai punya kamu)

   Atau kalau males pakai terminal: bikin repo kosong di GitHub → klik
   **"uploading an existing file"** → drag semua isi folder ini (bukan
   foldernya, tapi isinya) → Commit.

> File `.env` **gak akan ke-push** (udah diatur di `.gitignore`), jadi aman.

## LANGKAH 3 — Deploy ke Vercel

1. Buka [vercel.com](https://vercel.com), login pakai akun GitHub kamu.
2. Klik **Add New → Project**, pilih repo yang baru di-push.
3. Di halaman **Configure Project**, buka bagian **Environment Variables**, tambahin 3 ini:

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | (Project URL dari Langkah 1.7) |
   | `VITE_SUPABASE_ANON_KEY` | (Publishable key dari Langkah 1.7) |
   | `VITE_APP_PASSWORD` | kata sandi buat masuk app, bebas mau apa (kalau gak diisi, default-nya `ganbatte`) |

4. Klik **Deploy**. Tunggu ~1 menit.
5. Selesai! Buka URL Vercel kamu (misal `mainichi-daily-immersion.vercel.app`), masukin kata sandi tadi, langsung masuk.

---

## Develop lokal (opsional, kalau mau coba-coba/edit dulu sebelum deploy)

```bash
npm install
cp .env.example .env
# isi .env dengan Project URL, Publishable key, dan kata sandi
npm run dev
```
Buka `http://localhost:5173`.

## Soal kapasitas (free tier Supabase)
- Database: 500 MB — kosakata teks gak akan makan banyak, aman lama.
- File Storage (buat PDF): 1 GB — kira-kira cukup buat ratusan PDF skrip pendek.
- ⚠️ Project auto-pause kalau **7 hari** gak ada aktivitas sama sekali. Kalau kamu jeda lama, tinggal buka dashboard Supabase dan klik "Resume" — data gak hilang.

## Catatan soal privasi
Karena gak ada akun/login beneran, siapapun yang tau **URL Vercel kamu** +
**kata sandi**-nya bisa akses & edit data. Jangan share link app-nya
sembarangan, dan kalau bisa ganti kata sandi default (`ganbatte`) jadi
sesuatu yang cuma kamu tau (lewat `VITE_APP_PASSWORD` di Vercel).
