// Cuma nyimpen URUTAN kategori + emoji-nya. Daftar radikal itu sendiri
// (karakter, arti, menemonik, hafal) sekarang hidup di tabel Supabase
// "radikal" -- persis kayak kosakata hidup di tabel "kata". Diedit lewat
// halaman TebakRadikal, bukan di file ini.
export const NAMA_KATEGORI = [
  'Alam & Elemen', 'Tubuh Manusia', 'Hewan', 'Tumbuhan', 'Bangunan & Tempat',
  'Aksi/Gerakan', 'Makanan', 'Pakaian & Benda',
  'Angka & Bentuk Dasar', 'Orang & Keluarga', 'Bahasa & Indra', 'Ukuran & Tempat', 'Lainnya',
]

export const EMOJI_KATEGORI = {
  'Alam & Elemen': '🌍', 'Tubuh Manusia': '👤', 'Hewan': '🐾', 'Tumbuhan': '🌱',
  'Bangunan & Tempat': '🏠', 'Aksi/Gerakan': '✋', 'Makanan': '🍚', 'Pakaian & Benda': '👗',
  'Angka & Bentuk Dasar': '🔢', 'Orang & Keluarga': '👪', 'Bahasa & Indra': '👂',
  'Ukuran & Tempat': '📏', 'Lainnya': '✨',
}

// urutan tampil: kategori yang dikenal duluan (sesuai NAMA_KATEGORI), abjad
// buat kategori baru yang user bikin sendiri lewat form
export function urutkanKategori(daftarKategori) {
  const dikenal = NAMA_KATEGORI.filter(k => daftarKategori.includes(k))
  const baru = daftarKategori.filter(k => !NAMA_KATEGORI.includes(k)).sort((a, b) => a.localeCompare(b))
  return [...dikenal, ...baru]
}
