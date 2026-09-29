import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { urutkanKategori, EMOJI_KATEGORI } from '../data/radikalData'

// Keyboard radikal buat isi jawaban tes bunshuu. SENGAJA cuma nampilin
// karakternya doang (nggak ada arti/menemonik) biar active recall tetep
// jalan. Nambah/edit/hapus radikal dilakuin di halaman "Tebak Radikal",
// bukan di sini -- di sini murni buat milih & ketik.
export default function RadicalPicker({ onPilih, onClose, variant = 'overlay', open = true, onToggle }) {
  const [cari, setCari] = useState('')
  const [semua, setSemua] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!open) return
    let batal = false
    setLoading(true)
    supabase.from('radikal').select('id, karakter, kategori').order('created_at').then(({ data }) => {
      if (!batal) { setSemua(data || []); setLoading(false) }
    })
    return () => { batal = true }
  }, [open])

  const kategoriAda = urutkanKategori([...new Set(semua.map(r => r.kategori))])
  const gabungan = kategoriAda.map(kategori => {
    const dalamKategori = semua.filter(r => r.kategori === kategori)
    // Dedup per karakter -- kalau ada 2 baris beda arti tapi karakternya
    // sama (misal 阝 buat kozato vs oozato), buat KEYBOARD ini cukup satu
    // tombol aja, soalnya hasil ketikannya bakal sama persis.
    const unik = []
    const sudahAda = new Set()
    dalamKategori.forEach(r => {
      if (sudahAda.has(r.karakter)) return
      sudahAda.add(r.karakter)
      unik.push(r)
    })
    return { kategori, items: unik }
  })
  const filtered = gabungan.map(grup => ({
    ...grup,
    items: grup.items.filter(it => !cari || it.karakter.includes(cari)),
  })).filter(grup => grup.items.length > 0)

  const isi = (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#2d6a4a' }}>部首 Radikal</div>
      </div>

      <input
        placeholder="Cari karakter radikal..."
        value={cari}
        onChange={e => setCari(e.target.value)}
        style={{ padding: 8, borderRadius: 8, border: '1.5px solid #b8d8b8', marginBottom: 10, fontSize: 12, width: '100%', boxSizing: 'border-box', fontFamily: "'Noto Serif JP', serif" }}
      />

      <div style={{ overflowY: 'auto', flex: 1, padding: '0 3px', margin: '0 -3px' }}>
        {loading && <div style={{ textAlign: 'center', color: '#9abaa8', fontSize: 12, padding: 20 }}>Memuat...</div>}
        {!loading && filtered.map(grup => (
          <div key={grup.kategori} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: '#9abaa8', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>
              {EMOJI_KATEGORI[grup.kategori] || '✨'} {grup.kategori}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {grup.items.map(it => (
                <button
                  key={it.id}
                  onClick={() => onPilih(it.karakter)}
                  style={{
                    fontFamily: "'Noto Serif JP', serif", fontSize: 18, padding: '5px 8px',
                    borderRadius: 8, cursor: 'pointer', border: '1.5px solid #b8d8b8', background: '#f0f7f0',
                  }}
                >
                  {it.karakter}
                </button>
              ))}
            </div>
          </div>
        ))}
        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: 'center', color: '#9abaa8', fontSize: 12, padding: 20 }}>
            {semua.length === 0 ? 'Belum ada radikal. Tambahin dulu di halaman Tebak Radikal.' : 'Gak ketemu radikal itu.'}
          </div>
        )}
      </div>
    </>
  )

  const LEBAR_PANEL = 300

  if (variant === 'panel') {
    return (
      <>
        <div style={{
          position: 'fixed', top: 0, right: open ? 0 : -LEBAR_PANEL, width: LEBAR_PANEL, height: '100vh',
          background: '#fff', display: 'flex', flexDirection: 'column', padding: 16, boxSizing: 'border-box',
          boxShadow: '-6px 0 24px rgba(0,0,0,.15)', zIndex: 200, transition: 'right .25s ease',
        }}>
          {isi}
        </div>
        <button
          onClick={onToggle}
          title="Bantuan cari radikal"
          style={{
            position: 'fixed', top: '38%', right: open ? LEBAR_PANEL : 0, transform: 'translateY(-50%)',
            width: 34, height: 68, borderRadius: '8px 0 0 8px', border: 'none',
            background: '#2d6a4a', color: '#fff', fontSize: 13, fontWeight: 700, letterSpacing: '.05em',
            cursor: 'pointer', zIndex: 201, transition: 'right .25s ease',
            writingMode: 'vertical-rl', boxShadow: '-3px 3px 10px rgba(0,0,0,.18)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          部首
        </button>
      </>
    )
  }

  if (variant === 'sidebar') {
    return (
      <div style={{
        position: 'absolute', top: 0, left: '100%', marginLeft: 12, width: 260, maxHeight: 480,
        background: '#fff', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column',
        boxShadow: '0 6px 24px rgba(0,0,0,.18)', border: '1px solid #e0ede2', zIndex: 5,
      }}>
        {isi}
      </div>
    )
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 50,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ background: '#fff', borderRadius: 14, padding: 20, width: 400, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 40px rgba(0,0,0,.2)' }}>
        {isi}
      </div>
    </div>
  )
}
