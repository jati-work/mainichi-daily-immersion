import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'

function IconTrash({ color = '#c0392b', size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  )
}

function IconPlus({ color = '#2d6a4a', size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  )
}

// paketId, onClose: props dari PaketDetail
export default function DiaryHalaman({ paketId, onClose }) {
  const [halaman, setHalaman] = useState([]) // array, index 0 = terbaru
  const [indexAktif, setIndexAktif] = useState(0)
  const [teks, setTeks] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showKonfirmasiHapus, setShowKonfirmasiHapus] = useState(false)

  const debounceRef = useRef(null)
  const halamanAktif = halaman[indexAktif] || null

  // ----- load semua halaman diary, terbaru di atas -----
  async function muatHalaman() {
    setLoading(true)
    const { data, error } = await supabase
      .from('diary_pages')
      .select('*')
      .eq('paket_id', paketId)
      .order('created_at', { ascending: false })
    if (error) {
      console.error('Gagal memuat diary:', error)
      setLoading(false)
      return
    }
    let list = data || []
    // kalau belum ada halaman sama sekali, buatkan satu otomatis
    if (list.length === 0) {
      const { data: baru, error: err2 } = await supabase
        .from('diary_pages')
        .insert({ paket_id: paketId, isi_teks: '' })
        .select()
        .single()
      if (!err2 && baru) list = [baru]
    }
    setHalaman(list)
    setIndexAktif(0)
    setTeks(list[0]?.isi_teks || '')
    setLoading(false)
  }
  useEffect(() => { muatHalaman() }, [paketId])

  // ----- ganti teks lokal setiap pindah halaman -----
  useEffect(() => {
    setTeks(halamanAktif?.isi_teks || '')
  }, [indexAktif])

  // ----- autosave: debounce 1.5 detik setelah berhenti ngetik -----
  function handleChangeTeks(val) {
    setTeks(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      simpanTeks(val)
    }, 1500)
  }

  async function simpanTeks(val) {
    if (!halamanAktif) return
    setSaving(true)
    const { error } = await supabase
      .from('diary_pages')
      .update({ isi_teks: val, updated_at: new Date().toISOString() })
      .eq('id', halamanAktif.id)
    setSaving(false)
    if (error) { console.error('Gagal simpan diary:', error); return }
    setHalaman(list => list.map((h, i) => (i === indexAktif ? { ...h, isi_teks: val } : h)))
  }

  // ----- paksa simpan (dipanggil saat pindah halaman / tutup) -----
  function paksaSimpan() {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
      simpanTeks(teks)
    }
  }

  function gantiHalaman(delta) {
    paksaSimpan()
    setIndexAktif(i => Math.min(Math.max(i + delta, 0), halaman.length - 1))
  }

  async function tambahHalaman() {
    paksaSimpan()
    const { data, error } = await supabase
      .from('diary_pages')
      .insert({ paket_id: paketId, isi_teks: '' })
      .select()
      .single()
    if (error) { alert('Gagal menambah halaman: ' + error.message); return }
    setHalaman(list => [data, ...list])
    setIndexAktif(0)
  }

  async function hapusHalamanAktif() {
    if (!halamanAktif) return
    const id = halamanAktif.id
    await supabase.from('diary_pages').delete().eq('id', id)
    const sisa = halaman.filter(h => h.id !== id)
    if (sisa.length === 0) {
      // jangan biarkan kosong total, buat satu halaman baru kosong
      const { data } = await supabase.from('diary_pages').insert({ paket_id: paketId, isi_teks: '' }).select().single()
      setHalaman(data ? [data] : [])
      setIndexAktif(0)
      setTeks('')
    } else {
      const idxBaru = Math.min(indexAktif, sisa.length - 1)
      setHalaman(sisa)
      setIndexAktif(idxBaru)
      setTeks(sisa[idxBaru]?.isi_teks || '')
    }
    setShowKonfirmasiHapus(false)
  }

  function handleClose() {
    paksaSimpan()
    onClose()
  }

  return (
    <div className="pdf-panel">
      <div className="pdf-panel-header" style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            className="icon-btn"
            onClick={tambahHalaman}
            title="Tambah halaman baru"
            style={{ background: '#fff', border: '1.5px solid #2d6a4a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          ><IconPlus color="#2d6a4a" size={16} /></button>
          <span style={{ fontSize: 11, color: '#1a1a1a', opacity: 0.6, minWidth: 90 }}>
            {saving ? 'Menyimpan...' : 'Tersimpan'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifySelf: 'center' }}>
          <button className="icon-btn" onClick={() => gantiHalaman(-1)} disabled={indexAktif <= 0} style={{ width: 34, height: 34, fontSize: 18 }}>‹</button>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(255,255,255,0.15)', borderRadius: 20, padding: '4px 14px 4px 4px',
          }}>
            <span style={{
              background: '#1a1a1a', color: '#fff', fontSize: 15, fontWeight: 600,
              borderRadius: 14, padding: '4px 13px', minWidth: 20, textAlign: 'center',
            }}>{indexAktif + 1}</span>
            <span style={{ fontSize: 15, color: '#1a1a1a', opacity: 0.75 }}>/ {halaman.length}</span>
          </div>
          <button className="icon-btn" onClick={() => gantiHalaman(1)} disabled={indexAktif >= halaman.length - 1} style={{ width: 34, height: 34, fontSize: 18 }}>›</button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifySelf: 'end' }}>
          <button
            className="icon-btn danger"
            onClick={() => setShowKonfirmasiHapus(true)}
            title="Hapus halaman ini"
            disabled={!halamanAktif}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          ><IconTrash size={16} /></button>
          <button className="icon-btn" onClick={handleClose}>✕</button>
        </div>
      </div>

      <div className="pdf-panel-body" style={{ overflow: 'auto', display: 'flex', justifyContent: 'center', padding: 20 }}>
        {loading ? (
          <div style={{ color: '#cde8d0', padding: 30 }}>Memuat diary...</div>
        ) : (
          <textarea
            value={teks}
            onChange={e => handleChangeTeks(e.target.value)}
            placeholder="Tulis apa saja di sini..."
            style={{
              width: '100%', maxWidth: 820, minHeight: '100%', resize: 'none', border: 'none', outline: 'none',
              background: '#fff', padding: '36px 44px', fontSize: 17, lineHeight: 1.9, color: '#1f2d24',
              fontFamily: "'Noto Serif JP', serif", boxShadow: '0 0 0 1px rgba(0,0,0,.05)', borderRadius: 4,
            }}
          />
        )}
      </div>

      {showKonfirmasiHapus && (
        <div
          onClick={() => setShowKonfirmasiHapus(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 10, padding: '22px 24px', width: '90%', maxWidth: 340,
              boxShadow: '0 10px 30px rgba(0,0,0,.25)', textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 30, marginBottom: 8 }}>🗑️</div>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#1f2d24', marginBottom: 6 }}>
              Hapus halaman ini?
            </div>
            <div style={{ fontSize: 13, color: '#5b6b60', marginBottom: 18, lineHeight: 1.5 }}>
              Isi tulisan di halaman ini akan hilang permanen. Tindakan ini tidak bisa dibatalkan.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button
                onClick={() => setShowKonfirmasiHapus(false)}
                style={{
                  padding: '8px 18px', borderRadius: 6, border: '1px solid #d6ded9',
                  background: '#fff', color: '#3a4a40', fontSize: 13, cursor: 'pointer',
                }}
              >Batal</button>
              <button
                onClick={hapusHalamanAktif}
                style={{
                  padding: '8px 18px', borderRadius: 6, border: 'none',
                  background: '#c0392b', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >Ya, Hapus</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
