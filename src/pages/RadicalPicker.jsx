import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

// Daftar radikal bawaan, dikelompokkan berdasarkan KATEGORI/tema (bukan
// jumlah goresan). Sengaja cuma nyimpen karakternya doang, TANPA cara baca
// atau arti -- biar pas dipake buat tes bunshuu tetep active recall, jawaban
// nggak kebocor lewat tooltip/label.
// Kombinasi kayak 水/氵 sengaja DIPECAH jadi 2 entri/tombol terpisah biar
// nggak ambigu pas milih.
const NAMA_KATEGORI = [
  'Alam & Elemen', 'Tubuh Manusia', 'Hewan', 'Tumbuhan', 'Bangunan & Tempat',
  'Aksi/Gerakan', 'Makanan', 'Pakaian & Benda', 'Abstrak, Angka & Lainnya',
]
const EMOJI_KATEGORI = {
  'Alam & Elemen': '🌍', 'Tubuh Manusia': '👤', 'Hewan': '🐾', 'Tumbuhan': '🌱',
  'Bangunan & Tempat': '🏠', 'Aksi/Gerakan': '✋', 'Makanan': '🍚',
  'Pakaian & Benda': '👗', 'Abstrak, Angka & Lainnya': '🔤',
}
const RADIKAL = [
  { kategori: 'Alam & Elemen', chars: ['水', '氵', '火', '灬', '木', '土', '山', '石', '田', '谷', '里', '气', '雨', '風', '金', '西', '日', '月', '冫', '厂'] },
  { kategori: 'Tubuh Manusia', chars: ['人', '亻', '儿', '心', '忄', '手', '扌', '口', '目', '耳', '足', '身', '首', '面', '血', '骨', '毛', '皮', '牙', '爪', '自', '舌', '氏'] },
  { kategori: 'Hewan', chars: ['犬', '犭', '牛', '馬', '羊', '魚', '鳥', '隹', '虫', '羽', '角'] },
  { kategori: 'Tumbuhan', chars: ['艹', '禾', '竹', '米', '豆'] },
  { kategori: 'Bangunan & Tempat', chars: ['宀', '广', '戸', '門', '囗', '穴', '冖'] },
  { kategori: 'Aksi/Gerakan', chars: ['辶', '走', '攵', '力', '廾', '彳', '癶', '行', '入', '止'] },
  { kategori: 'Makanan', chars: ['食', '飠', '香', '酉', '皿'] },
  { kategori: 'Pakaian & Benda', chars: ['衣', '衤', '糸', '刀', '刂', '弓', '矢', '斤', '戈', '車', '舟', '巾'] },
  {
    kategori: 'Abstrak, Angka & Lainnya',
    chars: [
      '一', '十', '八', '乙', '丶', '丨', '言', '見', '音', '色', '方', '士', '寸', '卜', '又', '己', '卩', '匕', '厶',
      '非', '至', '高', '貝', '辛', '鬼', '長', '斉', '青', '頁', '飛', '小', '少', '大', '夕', '女', '子', '父', '母',
      '曰', '欠', '歹', '殳', '立', '尸', '疒', '疋', '白', '罒', '匚', '几', '工', '巛', '干', '彡', '冂', '阝', '阝',
    ],
  },
]

export default function RadicalPicker({ onPilih, onClose, variant = 'overlay', open = true, onToggle }) {
  const [cari, setCari] = useState('')
  const [custom, setCustom] = useState([])
  const [showTambah, setShowTambah] = useState(false)
  const [showHapus, setShowHapus] = useState(false)
  const [karakterBaru, setKarakterBaru] = useState('')
  const [kategoriBaru, setKategoriBaru] = useState(NAMA_KATEGORI[0])

  async function muatCustom() {
    const { data } = await supabase.from('custom_radikal').select('*').order('created_at')
    setCustom(data || [])
  }
  useEffect(() => { muatCustom() }, [])

  async function tambahRadikal() {
    if (!karakterBaru.trim()) { alert('Isi karakternya dulu ya!'); return }
    const { error } = await supabase.from('custom_radikal').insert({
      karakter: karakterBaru.trim(), kategori: kategoriBaru,
    })
    if (error) { alert('Gagal nyimpen: ' + error.message); return }
    setKarakterBaru('')
    setShowTambah(false)
    muatCustom()
  }

  async function hapusCustom(id) {
    await supabase.from('custom_radikal').delete().eq('id', id)
    muatCustom()
  }

  // Gabungin radikal bawaan + custom, dikelompokkan per kategori. Custom
  // yang kategorinya nggak dikenal (data lama / kosong) ditampung di
  // kelompok "Lainnya (tambahan)" di akhir, biar nggak hilang begitu aja.
  const namaDikenal = new Set(NAMA_KATEGORI)
  const gabungan = NAMA_KATEGORI.map(kategori => {
    const bawaan = (RADIKAL.find(g => g.kategori === kategori)?.chars || []).map(char => ({ char, custom: false }))
    const punyaSendiri = custom.filter(c => c.kategori === kategori).map(c => ({ char: c.karakter, custom: true, id: c.id }))
    return { kategori, items: [...bawaan, ...punyaSendiri] }
  })
  const customLainnya = custom.filter(c => !namaDikenal.has(c.kategori))
  if (customLainnya.length > 0) {
    gabungan.push({ kategori: 'Lainnya (tambahan)', items: customLainnya.map(c => ({ char: c.karakter, custom: true, id: c.id })) })
  }

  const filtered = gabungan.map(grup => ({
    ...grup,
    items: grup.items.filter(it => !cari || it.char.includes(cari)),
  })).filter(grup => grup.items.length > 0)

  const isi = (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#2d6a4a' }}>部首 Radikal</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => { setShowTambah(s => !s); setShowHapus(false) }}
            style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, border: '1.5px solid #b8d8b8', background: showTambah ? '#2d6a4a' : '#fff', color: showTambah ? '#fff' : '#2d6a4a', cursor: 'pointer' }}>
            ＋ Tambah
          </button>
          <button onClick={() => { setShowHapus(s => !s); setShowTambah(false) }}
            style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, border: '1.5px solid #d8b8b8', background: showHapus ? '#c0392b' : '#fff', color: showHapus ? '#fff' : '#c0392b', cursor: 'pointer' }}>
            🗑️ Hapus
          </button>
        </div>
      </div>
      {showHapus && (
        <div style={{ fontSize: 11, color: '#c0392b', marginBottom: 8, textAlign: 'center' }}>
          Klik radikal tambahan kamu (warna beda) buat hapus
        </div>
      )}

      {showTambah && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10, padding: 10, background: '#f0f7f0', borderRadius: 8 }}>
          <input placeholder="Karakter" value={karakterBaru} onChange={e => setKarakterBaru(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && tambahRadikal()}
            style={{ width: '100%', padding: 8, borderRadius: 6, border: '1.5px solid #b8d8b8', fontSize: 13, boxSizing: 'border-box' }} />
          <select value={kategoriBaru} onChange={e => setKategoriBaru(e.target.value)}
            style={{ width: '100%', padding: 8, borderRadius: 6, border: '1.5px solid #b8d8b8', fontSize: 13, boxSizing: 'border-box' }}>
            {NAMA_KATEGORI.map(k => <option key={k} value={k}>{EMOJI_KATEGORI[k]} {k}</option>)}
          </select>
          <button onClick={tambahRadikal}
            style={{ width: '100%', padding: 8, borderRadius: 6, border: 'none', background: '#2d6a4a', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            Simpan
          </button>
        </div>
      )}

      <input
        placeholder="Cari karakter radikal..."
        value={cari}
        onChange={e => setCari(e.target.value)}
        style={{ padding: 8, borderRadius: 8, border: '1.5px solid #b8d8b8', marginBottom: 10, fontSize: 12, width: '100%', boxSizing: 'border-box', fontFamily: "'Noto Serif JP', serif" }}
      />

      <div style={{ overflowY: 'auto', flex: 1, padding: '0 3px', margin: '0 -3px' }}>
        {filtered.map(grup => (
          <div key={grup.kategori} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: '#9abaa8', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>
              {EMOJI_KATEGORI[grup.kategori] || '✨'} {grup.kategori}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {grup.items.map((it, i) => (
                <button
                  key={it.id || `${it.char}-${i}`}
                  onClick={() => {
                    if (showHapus) { if (it.custom) hapusCustom(it.id); return }
                    onPilih(it.char)
                  }}
                  style={{
                    fontFamily: "'Noto Serif JP', serif", fontSize: 18, padding: '5px 8px',
                    borderRadius: 8, cursor: 'pointer',
                    border: '1.5px solid #b8d8b8', background: '#f0f7f0',
                    opacity: showHapus && !it.custom ? 0.4 : 1,
                    outline: showHapus && it.custom ? '2px solid #c0392b' : 'none',
                    outlineOffset: 1,
                  }}
                >
                  {it.char}
                </button>
              ))}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', color: '#9abaa8', fontSize: 12, padding: 20 }}>
            Gak ketemu radikal itu.
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
