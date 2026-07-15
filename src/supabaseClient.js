import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    'Supabase belum dikonfigurasi! Cek file .env (lokal) atau Environment Variables (Vercel).'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Project Supabase ke-2, khusus buat Storage PDF paket yang kolomnya "kanan"
// (folder harian: Netflix, Youtube, dst). Database utama (folders/paket/kata/
// jurnal) TETEP di project pertama di atas, cuma file PDF-nya doang yang
// dipisah ke sini biar nggak numpuk di storage yang lama.
const storageUrl = import.meta.env.VITE_SUPABASE_STORAGE_URL
const storageKey = import.meta.env.VITE_SUPABASE_STORAGE_KEY

if (!storageUrl || !storageKey) {
  console.error(
    'Supabase Storage (kolom kanan) belum dikonfigurasi! Cek VITE_SUPABASE_STORAGE_URL & VITE_SUPABASE_STORAGE_KEY.'
  )
}

export const supabaseStorage = createClient(storageUrl, storageKey)
