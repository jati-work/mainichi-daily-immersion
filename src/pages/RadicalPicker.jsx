import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

// Daftar radikal umum, dikelompokkan berdasarkan jumlah goresan.
// Data statis murni — tidak ada API, tidak butuh internet.
const RADIKAL = [
  { strokes: 1, items: [
    { char: '一', nama: 'ichi' }, { char: '｜', nama: 'bou' }, { char: '丶', nama: 'ten' }, { char: '乙', nama: 'otsu' },
  ]},
  { strokes: 2, items: [
    { char: '亻', nama: 'ninben' }, { char: '人', nama: 'hito' }, { char: '儿', nama: 'ninnyou / hitoashi' },
    { char: '入', nama: 'iru' }, { char: '八', nama: 'hachi' }, { char: '冂', nama: 'keigamae' },
    { char: '冫', nama: 'nisui' }, { char: '刀', nama: 'katana' }, { char: '刂', nama: 'rittou' },
    { char: '力', nama: 'chikara' }, { char: '勹', nama: 'tsutsumigamae' }, { char: '匕', nama: 'hi' },
    { char: '十', nama: 'juu' }, { char: '卜', nama: 'boku' }, { char: '厶', nama: 'shi' },
    { char: '又', nama: 'mata' }, { char: '阝(左)', nama: 'kozato-hen' }, { char: '阝(右)', nama: 'oozato' },
  ]},
  { strokes: 3, items: [
    { char: '氵', nama: 'sanzui (air)' }, { char: '扌', nama: 'tehen (tangan)' }, { char: '忄', nama: 'risshinben (hati)' },
    { char: '宀', nama: 'ukanmuri (atap)' }, { char: '辶', nama: 'shinnyou (berjalan)' }, { char: '艹', nama: 'kusakanmuri (rumput)' },
    { char: '女', nama: 'onna (perempuan)' }, { char: '子', nama: 'ko (anak)' }, { char: '寸', nama: 'sun' },
    { char: '小', nama: 'shou (kecil)' }, { char: '山', nama: 'yama (gunung)' }, { char: '巛', nama: 'kawa (sungai)' },
    { char: '工', nama: 'kou' }, { char: '己', nama: 'onore' }, { char: '巾', nama: 'habenn (kain)' },
    { char: '干', nama: 'kan' }, { char: '广', nama: 'madare (atap miring)' }, { char: '弓', nama: 'yumihen (busur)' },
    { char: '彳', nama: 'gyouninben (melangkah)' }, { char: '土', nama: 'tsuchi (tanah)' }, { char: '士', nama: 'samurai' },
    { char: '夕', nama: 'yuu (senja)' }, { char: '大', nama: 'dai (besar)' }, { char: '口', nama: 'kuchi (mulut)' },
    { char: '耂', nama: 'oigashira (tua, dari 老)' },
  ]},
  { strokes: 4, items: [
    { char: '木', nama: 'kihen (pohon/kayu)' }, { char: '月', nama: 'tsuki / nikuzuki (bulan/daging)' }, { char: '火', nama: 'hihen (api)' },
    { char: '灬', nama: 'renga (api di bawah)' }, { char: '心', nama: 'kokoro (hati)' }, { char: '手', nama: 'te (tangan)' },
    { char: '日', nama: 'hi / nichi (matahari)' }, { char: '曰', nama: 'etsu' }, { char: '水', nama: 'mizu (air)' },
    { char: '犬', nama: 'inu (anjing)' }, { char: '牛', nama: 'ushihen (sapi)' }, { char: '王', nama: 'ouhen (raja/giok)' },
    { char: '欠', nama: 'akubi (menguap)' }, { char: '止', nama: 'tomeru (berhenti)' }, { char: '歹', nama: 'gatsuhen' },
    { char: '殳', nama: 'rumata' }, { char: '毛', nama: 'ke (bulu)' }, { char: '氏', nama: 'uji' },
    { char: '气', nama: 'ki (udara)' }, { char: '父', nama: 'chichi (ayah)' }, { char: '牙', nama: 'kiba (taring)' },
    { char: '爪', nama: 'tsume (cakar)' }, { char: '尸', nama: 'shikabane' }, { char: '屮', nama: 'tetsu' },
    { char: '斤', nama: 'ono (kapak, di 近・新)' }, { char: '方', nama: 'kata (di 族・旅)' },
  ]},
  { strokes: 5, items: [
    { char: '糸', nama: 'itohen (benang)' }, { char: '目', nama: 'mehen (mata)' }, { char: '示', nama: 'shimesuhen (dewa)' },
    { char: '礻', nama: 'shimesuhen (versi kanan)' }, { char: '禾', nama: 'nogihen (padi)' }, { char: '穴', nama: 'anakanmuri (lubang)' },
    { char: '立', nama: 'tatsu (berdiri)' }, { char: '疒', nama: 'yamaidare (penyakit)' }, { char: '皮', nama: 'kawa (kulit)' },
    { char: '皿', nama: 'sara (piring)' }, { char: '矢', nama: 'yahen (panah)' }, { char: '石', nama: 'ishihen (batu)' },
    { char: '田', nama: 'tahen (sawah)' }, { char: '疋', nama: 'hikitsu' }, { char: '白', nama: 'shiro (putih)' },
  ]},
  { strokes: 6, items: [
    { char: '竹', nama: 'takekanmuri (bambu)' }, { char: '米', nama: 'komehen (beras)' }, { char: '缶', nama: 'fu (tempayan)' },
    { char: '羊', nama: 'hitsuji (domba)' }, { char: '羽', nama: 'hane (bulu sayap)' }, { char: '耳', nama: 'mimihen (telinga)' },
    { char: '肉', nama: 'niku (daging)' }, { char: '自', nama: 'mizukara (diri sendiri)' }, { char: '色', nama: 'iro (warna)' },
    { char: '虫', nama: 'mushihen (serangga)' }, { char: '衣', nama: 'koromo (baju)' }, { char: '西', nama: 'nishi (barat)' },
    { char: '舟', nama: 'funehen (perahu, di 船)' },
  ]},
  { strokes: 7, items: [
    { char: '言', nama: 'gonben (kata/bicara)' }, { char: '貝', nama: 'kaihen (kerang/uang)' }, { char: '足', nama: 'ashihen (kaki)' },
    { char: '車', nama: 'kurumahen (kendaraan)' }, { char: '辛', nama: 'karai (pedas)' }, { char: '見', nama: 'miru (melihat)' },
    { char: '角', nama: 'tsunohen (tanduk)' }, { char: '谷', nama: 'tani (lembah)' }, { char: '豆', nama: 'mame (kacang)' },
    { char: '酉', nama: 'torihen (di 酒・配)' }, { char: '里', nama: 'sato (di 野・重)' },
  ]},
  { strokes: 8, items: [
    { char: '金', nama: 'kanehen (logam)' }, { char: '門', nama: 'mongamae (pintu gerbang)' }, { char: '雨', nama: 'amekanmuri (hujan)' },
    { char: '青', nama: 'ao (biru/hijau)' }, { char: '長', nama: 'nagai (panjang)' }, { char: '斉', nama: 'sei' },
    { char: '隹', nama: 'furutori (di 集・雑)' },
  ]},
  { strokes: 9, items: [
    { char: '食', nama: 'shokuhen (makan)' }, { char: '首', nama: 'kubi (leher)' }, { char: '香', nama: 'kaori (aroma)' },
    { char: '馬', nama: 'umahen (kuda)' }, { char: '頁', nama: 'oogai (di 頭・題)' },
  ]},
  { strokes: 10, items: [
    { char: '高', nama: 'takai (tinggi)' }, { char: '骨', nama: 'honehen (tulang, di 骨)' },
  ]},
  { strokes: 11, items: [
    { char: '鳥', nama: 'tori (burung, di 鳥・鳴)' },
  ]},
]

export default function RadicalPicker({ onPilih, onClose, variant = 'overlay', open = true, onToggle }) {
  const [cari, setCari] = useState('')
  const [custom, setCustom] = useState([])
  const [showTambah, setShowTambah] = useState(false)
  const [karakterBaru, setKarakterBaru] = useState('')
  const [namaBaru, setNamaBaru] = useState('')
  const [strokesBaru, setStrokesBaru] = useState('')

  async function muatCustom() {
    const { data } = await supabase.from('custom_radikal').select('*').order('strokes')
    setCustom(data || [])
  }
  useEffect(() => { muatCustom() }, [])

  async function tambahRadikal() {
    if (!karakterBaru.trim() || !strokesBaru) { alert('Isi karakter dan jumlah goresannya dulu ya!'); return }
    const { error } = await supabase.from('custom_radikal').insert({
      karakter: karakterBaru.trim(), nama: namaBaru.trim(), strokes: parseInt(strokesBaru),
    })
    if (error) { alert('Gagal nyimpen: ' + error.message); return }
    setKarakterBaru(''); setNamaBaru(''); setStrokesBaru('')
    setShowTambah(false)
    muatCustom()
  }

  async function hapusCustom(id) {
    if (!confirm('Hapus radikal ini dari daftar kamu?')) return
    await supabase.from('custom_radikal').delete().eq('id', id)
    muatCustom()
  }

  // Gabungkan radikal bawaan + custom, dikelompokkan per goresan
  const semuaGoresan = [...new Set([...RADIKAL.map(g => g.strokes), ...custom.map(c => c.strokes)])].sort((a, b) => a - b)
  const gabungan = semuaGoresan.map(strokes => {
    const bawaan = RADIKAL.find(g => g.strokes === strokes)?.items.map(it => ({ ...it, custom: false })) || []
    const punyaSendiri = custom.filter(c => c.strokes === strokes).map(c => ({ char: c.karakter, nama: c.nama || '(tambahan sendiri)', custom: true, id: c.id }))
    return { strokes, items: [...bawaan, ...punyaSendiri] }
  })

  const filtered = gabungan.map(grup => ({
    ...grup,
    items: grup.items.filter(it =>
      !cari || it.nama.toLowerCase().includes(cari.toLowerCase()) || it.char.includes(cari)
    ),
  })).filter(grup => grup.items.length > 0)

  const isi = (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#2d6a4a' }}>部首 Radikal</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button onClick={() => setShowTambah(s => !s)}
            style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, border: '1.5px solid #b8d8b8', background: showTambah ? '#2d6a4a' : '#fff', color: showTambah ? '#fff' : '#2d6a4a', cursor: 'pointer' }}>
            ＋ Tambah
          </button>
          {onClose && <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 16 }}>✕</button>}
        </div>
      </div>

      {showTambah && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, padding: 8, background: '#f0f7f0', borderRadius: 8, flexWrap: 'wrap' }}>
          <input placeholder="Karakter" value={karakterBaru} onChange={e => setKarakterBaru(e.target.value)}
            style={{ width: 50, padding: 6, borderRadius: 6, border: '1.5px solid #b8d8b8', fontFamily: "'Noto Serif JP', serif", fontSize: 14 }} />
          <input placeholder="Nama (opsional)" value={namaBaru} onChange={e => setNamaBaru(e.target.value)}
            style={{ flex: 1, minWidth: 60, padding: 6, borderRadius: 6, border: '1.5px solid #b8d8b8', fontSize: 12 }} />
          <input placeholder="Goresan" type="number" min="1" value={strokesBaru} onChange={e => setStrokesBaru(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && tambahRadikal()}
            style={{ width: 50, padding: 6, borderRadius: 6, border: '1.5px solid #b8d8b8', fontSize: 12 }} />
          <button onClick={tambahRadikal}
            style={{ padding: '6px 10px', borderRadius: 6, border: 'none', background: '#2d6a4a', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
            Simpan
          </button>
        </div>
      )}

      <input
        placeholder="Cari nama radikal (misal: te, mizu, kuchi)..."
        value={cari}
        onChange={e => setCari(e.target.value)}
        style={{ padding: 8, borderRadius: 8, border: '1.5px solid #b8d8b8', marginBottom: 10, fontSize: 12, width: '100%', boxSizing: 'border-box' }}
      />

      <div style={{ overflowY: 'auto', flex: 1 }}>
        {filtered.map(grup => (
          <div key={grup.strokes} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: '#9abaa8', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>
              {grup.strokes} goresan
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {grup.items.map(it => (
                <div key={it.id || it.char} style={{ position: 'relative' }}>
                  <button
                    title={it.nama}
                    onClick={() => onPilih(it.char)}
                    style={{
                      fontFamily: "'Noto Serif JP', serif", fontSize: 18, padding: '5px 8px',
                      borderRadius: 8, border: it.custom ? '1.5px solid #7aaa8a' : '1.5px solid #b8d8b8',
                      background: it.custom ? '#e6f2e8' : '#f0f7f0', cursor: 'pointer',
                    }}
                  >
                    {it.char}
                  </button>
                  {it.custom && (
                    <button
                      onClick={(e) => { e.stopPropagation(); hapusCustom(it.id) }}
                      title="Hapus radikal ini"
                      style={{
                        position: 'absolute', top: -6, right: -6, width: 16, height: 16, borderRadius: '50%',
                        border: 'none', background: '#c0392b', color: '#fff', fontSize: 9, lineHeight: 1,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >✕</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', color: '#9abaa8', fontSize: 12, padding: 20 }}>
            Gak ketemu radikal dengan nama itu.
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
