import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase, supabaseStorage } from '../supabaseClient'
import PdfHighlighter from './PdfHighlighter'
import DiaryHalaman from './DiaryHalaman'
import RadicalPicker from './RadicalPicker'
import ImportExcel from '../components/ImportExcel'
import { fetchAll } from '../lib/fetchAll'

// Romaji bantuan di belakang kalimat, contoh: 首に拭きます。 (kubi ni fukimasu)
// Cuma kurung di AKHIR yang isinya huruf latin (dan ada huruf kecil) yang dianggap romaji,
// jadi "(PT)" atau kurung berisi kanji nggak ikut terbuang.
const ROMAJI_AKHIR = /\s*[（(](?=[^)）]*[a-zāīūēō])[A-Za-z\u00C0-\u024F\s.,'’\-!?]+[)）]\s*$/
function pisahRomaji(s) {
  const str = String(s ?? '')
  const m = str.match(ROMAJI_AKHIR)
  if (!m) return { utama: str, romaji: '' }
  return {
    utama: str.slice(0, m.index).trimEnd(),
    romaji: m[0].replace(/^\s*[（(]\s*/, '').replace(/\s*[)）]\s*$/, ''),
  }
}
function jpMurni(s) { return pisahRomaji(s).utama }

function normalisasiJP(s) {
  return jpMurni(s).trim().toLowerCase().replace(/[\s、。！？・「」]/g, '').normalize('NFKC')
}
// pemisah Kata Baru: koma Jepang (、) ATAU koma biasa (,) -- dua-duanya diterima.
// Disimpan ke DB selalu dengan pemisah ", " biar tampilan & pencarian lama tetap jalan.
function pecahKataBaru(s) {
  return parseKataBaru(s).map(x => x.kata) // kata-nya aja (tanpa arti), dipakai buat badge & cek duplikat
}
// Kata Baru boleh berisi arti per kata: "聞=telinga、見=lihat" (= atau ＝ antara kata & arti).
// Pemisah antar pasangan: koma Jepang (、) atau koma biasa. Data lama tanpa arti tetap valid.
// Format lengkap per kata: "過ごす=menghabiskan waktu|過ごせます|可能形" -> kata=arti|bentuk di kalimat|jenis perubahan
function parseKataBaru(s) {
  return String(s || '').split(/[,，、､]/).map(t => t.trim()).filter(Boolean).map(t => {
    const i = t.search(/[=＝]/)
    if (i === -1) return { kata: t, arti: '', bentuk: '', jenis: '' }
    const [arti = '', bentuk = '', jenis = ''] = t.slice(i + 1).split(/[|｜]/).map(x => x.trim())
    return { kata: t.slice(0, i).trim(), arti, bentuk, jenis }
  }).filter(x => x.kata)
}
// daftar jenis perubahan kata (nilai = yang disimpan, label = yang kelihatan di dropdown)
const JENIS_PERUBAHAN = [
  { nilai: 'ます形', label: 'ます形 (sopan)' },
  { nilai: 'て形', label: 'て形' },
  { nilai: 'た形', label: 'た形 (lampau)' },
  { nilai: 'ない形', label: 'ない形 (negatif)' },
  { nilai: '可能形', label: '可能形 (potensial)' },
  { nilai: '受身形', label: '受身形 (pasif)' },
  { nilai: '使役形', label: '使役形 (kausatif)' },
  { nilai: '命令形', label: '命令形 (imperatif)' },
  { nilai: '意向形', label: '意向形 (ajakan)' },
  { nilai: '条件形', label: '条件形 (kondisional)' },
]

// ---- pencarian duplikat di SERVER (filter kasar) ----
// Variasi tulisan sebuah kata yang dipakai buat filter ILIKE di server. Server cuma
// mempersempit kandidat (superset); keputusan "sama atau tidak" tetap pakai normalisasiJP di klien.
function varianCari(kata) {
  return [...new Set([jpMurni(kata).trim(), normalisasiJP(kata)].filter(Boolean))]
}
// Bikin pola ILIKE '%nilai%' yang aman dipakai di dalam filter .or() PostgREST:
// (1) spasi/tanda baca yang dibuang normalisasiJP diganti wildcard % (jadi "ABC  TEST" tetap
//     ketemu "ABC test"), (2) wildcard LIKE (% _ \) di nilai asli dijadikan literal,
// (3) nilai dibungkus kutip ganda supaya koma/kurung/titik nggak merusak sintaks filter.
function polaIlike(v) {
  const bagian = String(v).split(/[\s、。！？・「」]+/).filter(Boolean).map(x => x.replace(/[\\%_]/g, '\\$&'))
  if (bagian.length === 0) return null
  const pola = '%' + bagian.join('%') + '%'
  return '"' + pola.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'
}

function normalisasiID(s) {
  return String(s).trim().toLowerCase().replace(/[、。！？\s]/g, '')
}
function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Kartu didefinisiin di LUAR komponen utama (bukan di dalam PaketDetail)
// dan sengaja bukan sekadar fungsi biasa yang dibikin ulang tiap render.
// Kalau didefinisiin di dalam, tiap kali dragOverId/draggingId berubah
// (yaitu tiap event dragover, bisa puluhan kali per detik) React nganggep
// <Kartu> itu "komponen baru", jadi semua kartu ke-remount di tengah
// proses drag -> browser otomatis batalin drag yang lagi jalan.
function Kartu({
  k, isFlipped, isDragging, isDragOver, dragOverPos, pindahMode, editMode, hapusMode,
  onClick, onToggleHafal, onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop,
}) {
  const { utama: jpUtama, romaji: jpRomaji } = pisahRomaji(k.jp)
  return (
    <div
      className={`card ${isFlipped ? 'flipped' : ''} ${k.hafal ? 'hafal' : ''}`}
      data-pindah-item
      draggable={pindahMode}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{
        opacity: isDragging ? 0.4 : 1,
        borderLeft: isDragOver && dragOverPos === 'before' ? '3px solid #4a90d9' : '3px solid transparent',
        borderRight: isDragOver && dragOverPos === 'after' ? '3px solid #4a90d9' : '3px solid transparent',
      }}
    >
      <div
        className="card-inner" onClick={onClick}
        style={{
          boxShadow: editMode ? '0 0 0 2px #7aaa8a' : hapusMode ? '0 0 0 2px #f0a8a0' : pindahMode ? '0 0 0 1.5px #cbb8e8' : 'none',
          cursor: pindahMode ? 'grab' : undefined,
        }}
      >
        <div className="card-front">
          <div>
            {jpUtama}
            {jpRomaji && <div style={{ fontSize: 12, marginTop: 4, color: '#7a9a86' }}>({jpRomaji})</div>}
          </div>
        </div>
        <div className="card-back">
          <div>{k.arti}</div>
        </div>
      </div>
      <button className="hafal-toggle" onClick={(e) => { e.stopPropagation(); onToggleHafal(k) }}>✓</button>
    </div>
  )
}

// Versi "kertas lipat" (accordion) buat sisi Harian -- klik buat expand
// ke bawah nampilin arti/konteks/nuansa, bukan flip 3D kayak kartu kata.
// Lebih cocok buat kalimat/ekspresi yang lebih panjang.
function BadgeKataBaru({ k }) {
  if (!k.kata_baru) return null
  const words = parseKataBaru(k.kata_baru)
  if (words.length === 0) return null
  return (
    <div className="badge-kata-baru-wrap">
      {words.map((w, i) => (
        <span key={i} className={`badge-kata-baru ${k.hafal ? 'hafal' : ''}`} title={[w.arti, w.bentuk && `${w.bentuk}${w.jenis ? ' (' + w.jenis + ')' : ''}`].filter(Boolean).join(' · ') || undefined}>{w.kata}</span>
      ))}
    </div>
  )
}

// blok "JP" = kalimat Jepang + badge kata_baru yang ditag di kalimat itu
function BlokJp({ k }) {
  const { utama, romaji } = pisahRomaji(k.jp)
  return (
    <div className="baris-kalimat-blok">
      <div className="baris-kalimat-jp">
        {utama}
        {romaji && (
          <span style={{ fontSize: '0.62em', color: '#7a9a86', marginLeft: 10, fontFamily: 'inherit' }}>({romaji})</span>
        )}
      </div>
      <BadgeKataBaru k={k} />
    </div>
  )
}
// blok "arti" = arti + konteks/nuansa (kalau diisi)
function BlokArti({ k }) {
  return (
    <div className="baris-kalimat-blok">
      <div className="baris-kalimat-arti-inline">{k.arti}</div>
      {(k.konteks || k.nuansa) && (
        <div className="baris-kalimat-sub-inline">
          {k.konteks && <span>📍 {k.konteks}</span>}
          {k.nuansa && <span>🎭 {k.nuansa}</span>}
        </div>
      )}
    </div>
  )
}

function BarisKalimat({
  k, isFlipped, isDragging, isDragOver, dragOverPos, pindahMode, editMode, hapusMode, modeArtiDulu,
  onClick, onToggleHafal, onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop,
}) {
  const depan = modeArtiDulu ? <BlokArti k={k} /> : <BlokJp k={k} />
  const belakang = modeArtiDulu ? <BlokJp k={k} /> : <BlokArti k={k} />
  return (
    <div
      className={`baris-kalimat ${k.hafal ? 'hafal' : ''}`}
      data-pindah-item
      draggable={pindahMode}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{
        opacity: isDragging ? 0.4 : 1,
        borderTop: isDragOver && dragOverPos === 'before' ? '3px solid #4a90d9' : '3px solid transparent',
        borderBottom: isDragOver && dragOverPos === 'after' ? '3px solid #4a90d9' : '3px solid transparent',
        boxShadow: editMode ? '0 0 0 2px #7aaa8a' : hapusMode ? '0 0 0 2px #f0a8a0' : pindahMode ? '0 0 0 1.5px #cbb8e8' : 'none',
      }}
    >
      <div className="baris-kalimat-atas" onClick={onClick} style={{ cursor: pindahMode ? 'grab' : 'pointer' }}>
        {depan}
        <button className="hafal-toggle-inline" onClick={(e) => { e.stopPropagation(); onToggleHafal(k) }}>✓</button>
      </div>
      <div
        className="baris-kalimat-expand"
        style={{ gridTemplateRows: isFlipped ? '1fr' : '0fr', borderTop: isFlipped ? '1px solid #e5efe5' : '1px solid transparent' }}
      >
        <div className="baris-kalimat-expand-inner">
          {belakang}
        </div>
      </div>
    </div>
  )
}

export default function PaketDetail({ paketId, goTo }) {
  const [paket, setPaket] = useState(null)
  const [kataList, setKataList] = useState([])
  const [flipped, setFlipped] = useState(new Set())
  const [showForm, setShowForm] = useState(false)
  const [jp, setJp] = useState('')
  const [arti, setArti] = useState('')
  const [contohKalimat, setContohKalimat] = useState('')
  const [bunshuu, setBunshuu] = useState('')
  const [plesetan, setPlesetan] = useState('')
  const [konteks, setKonteks] = useState('')
  const [nuansa, setNuansa] = useState('')
  const [kataBaruInput, setKataBaruInput] = useState('')
  const [modeArtiDulu, setModeArtiDulu] = useState(false)
  const [bagianInput, setBagianInput] = useState('')
  const [dup, setDup] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [artiKata, setArtiKata] = useState({}) // arti per kata di Kata Baru: { 聞: 'telinga' }
  const [ubahKata, setUbahKata] = useState({}) // perubahan per kata: { 過ごす: { bentuk: '過ごせます', jenis: '可能形' } }
  const [sisiPaket, setSisiPaket] = useState('kiri') // 'kiri' = buku (kata+bunshuu), 'kanan' = harian (kalimat+konteks+nuansa)
  const jpInputRef = useRef(null)
  const formSebarisRef = useRef(null)
  const kanjiTesRef = useRef(null)
  const artiTesRef = useRef(null)
  const bagianScrollRef = useRef(null)
  const [scrollState, setScrollState] = useState({ canLeft: false, canRight: false })
  const [showPdf, setShowPdf] = useState(false)
  const [showDiary, setShowDiary] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [pdfUrl, setPdfUrl] = useState(null)
  const [adaIsiDiary, setAdaIsiDiary] = useState(false)

  // ----- filter & mode -----
  const [filterBagian, setFilterBagian] = useState('all')
  const [random, setRandom] = useState(false)
  const [randomOrder, setRandomOrder] = useState(new Map())
  const [sembunyikan, setSembunyikan] = useState(false)
  const [tampilkanHafal, setTampilkanHafal] = useState(false)
  const [kartuMode, setKartuMode] = useState(null) // 'buka' | 'tutup' | null
  const [editMode, setEditMode] = useState(false)
  const [hapusMode, setHapusMode] = useState(false)
  const [pindahMode, setPindahMode] = useState(false)
  const [draggingId, setDraggingId] = useState(null)
  const [dragOverId, setDragOverId] = useState(null)
  const [dragOverPos, setDragOverPos] = useState('before')
  const [pindahBagianMode, setPindahBagianMode] = useState(false)
  const [draggingBagian, setDraggingBagian] = useState(null)
  const [dragOverBagian, setDragOverBagian] = useState(null)
  const [showMenu, setShowMenu] = useState(false)
  const [showTesBawah, setShowTesBawah] = useState(false)

  useEffect(() => {
  function handleClickOutside(e) {
    if (!e.target.closest('[data-dropdown]')) {
      setShowMenu(false)
      setShowTesBawah(false)
    }
    if (!e.target.closest('[data-form-area]') && !e.target.closest('.card') && !e.target.closest('.modal-overlay') && !e.target.closest('[data-pindah-item]')) {
      batalForm()
      setEditMode(false)
      setHapusMode(false)
      setPindahMode(false)
      setPindahBagianMode(false)
    }
  }
  document.addEventListener('mousedown', handleClickOutside)
  return () => document.removeEventListener('mousedown', handleClickOutside)
}, [])
  
  const [showTesAtas, setShowTesAtas] = useState(false)

  // ----- tes (quiz) -----
  const [tes, setTes] = useState(null)
  const [showRadikalTes, setShowRadikalTes] = useState(false)

  async function muatSemua() {
    const { data: p } = await supabase.from('paket').select('*').eq('id', paketId).single()
    setPaket(p)
    if (p) setSisiPaket(await tentukanSisiStorage(p))
    const { data: k } = await fetchAll(() => supabase.from('kata').select('*').eq('paket_id', paketId).order('created_at').order('id'))
    setKataList(k || [])
  }

  // ---------- nentuin PDF paket ini masuk storage kiri (lama) atau kanan (baru) ----------
  // kalau paket-nya nempel langsung di root (folder_id null), pake kolom-nya sendiri.
  // kalau di dalem sub-folder, naik terus sampe ketemu folder paling atas (root),
  // terus pake kolom folder root itu -- biar semua sub-folder & paket di dalemnya
  // otomatis ngikut tanpa perlu di-set manual satu-satu.
  async function tentukanSisiStorage(paketRow) {
    if (!paketRow?.folder_id) return paketRow?.kolom || 'kiri'
    const { data: allFolders } = await supabase.from('folders').select('id, parent_id, kolom')
    if (!allFolders) return 'kiri'
    let cur = allFolders.find(f => f.id === paketRow.folder_id)
    while (cur && cur.parent_id) {
      cur = allFolders.find(f => f.id === cur.parent_id)
    }
    return cur?.kolom || 'kiri'
  }
  function clientStorageUntuk(sisi) {
    return sisi === 'kanan' ? supabaseStorage : supabase
  }
  async function cekIsiDiary() {
    const { data } = await supabase.from('diary_pages').select('isi_teks').eq('paket_id', paketId)
    setAdaIsiDiary((data || []).some(d => d.isi_teks && d.isi_teks.trim().length > 0))
  }
  useEffect(() => { muatSemua(); cekIsiDiary() }, [paketId])
  // pindah bagian -> daftar mulai dari ATAS lagi (bukan nerusin posisi scroll bagian sebelumnya)
  useEffect(() => {
    window.scrollTo({ top: 0 })
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
  }, [filterBagian])
  // mulai edit -> form muncul di tempat kartunya; fokus ke isian pertama & pastikan kelihatan
  useEffect(() => {
    if (!editingId) return
    setTimeout(() => {
      formSebarisRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      jpInputRef.current?.focus()
    }, 0)
  }, [editingId])

  const bagianList = paket?.bagian_list || []

  function updateScrollState() {
    const el = bagianScrollRef.current
    if (!el) return
    setScrollState({
      canLeft: el.scrollLeft > 2,
      canRight: el.scrollLeft < el.scrollWidth - el.clientWidth - 2,
    })
  }

  function geserBagian(arah) {
    const el = bagianScrollRef.current
    if (!el) return
    el.scrollBy({ left: arah * 220, behavior: 'smooth' })
  }

  useEffect(() => {
    updateScrollState()
    window.addEventListener('resize', updateScrollState)
    return () => window.removeEventListener('resize', updateScrollState)
  }, [bagianList])

  function toggleFlip(id) {
    const next = new Set(flipped)
    if (next.has(id)) next.delete(id); else next.add(id)
    setFlipped(next)
    setKartuMode(null)
  }

  function tanggalHariIni() {
    const d = new Date()
    const pad2 = n => n < 10 ? '0' + n : '' + n
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
  }
  async function catatAktivitasHariIni() {
    try {
      await supabase.from('aktivitas_harian').upsert({ tanggal: tanggalHariIni() }, { onConflict: 'tanggal' })
    } catch (err) {
      console.error('Gagal catat aktivitas harian:', err.message)
    }
  }

  async function toggleHafal(k) {
    const jadiHafal = !k.hafal
    await supabase.from('kata').update({ hafal: jadiHafal }).eq('id', k.id)
    if (jadiHafal) catatAktivitasHariIni()
    muatSemua()
  }

  // cek exact-match kalimat penuh, KHUSUS ke field jp doang (bukan
  // kata_baru) -- dipake buat block total kalimat yang persis sama.
  // Ambil baris kata yang KEMUNGKINAN cocok dengan salah satu kata, difilter di server
  // (ILIKE di kolom-kolom yang diminta) lalu dipaginasi sampai habis. Hasilnya superset:
  // pencocokan final tetap dilakukan di klien pakai normalisasiJP.
  // Sebelumnya: seluruh tabel kata diunduh tiap kali simpan.
  async function cariBarisKemungkinanCocok(daftarKata, kolomList, select, excludeId = null) {
    const pola = [...new Set(daftarKata.flatMap(varianCari).map(polaIlike).filter(Boolean))]
    if (pola.length === 0) return []
    const potongan = []
    for (let i = 0; i < pola.length; i += 10) potongan.push(pola.slice(i, i + 10)) // jaga panjang URL
    const hasil = await Promise.all(potongan.map(async p => {
      const cond = p.flatMap(x => kolomList.map(k => `${k}.ilike.${x}`)).join(',')
      const { data, error } = await fetchAll(() => {
        let q = supabase.from('kata').select(select).or(cond).order('id')
        if (excludeId) q = q.neq('id', excludeId)
        return q
      })
      if (error) console.error('Gagal cek duplikat:', error.message)
      return data || []
    }))
    const unik = new Map()
    hasil.flat().forEach(r => unik.set(r.id, r))
    return [...unik.values()]
  }

  // cek exact-match kalimat penuh, KHUSUS ke field jp doang (bukan
  // kata_baru) -- dipake buat block total kalimat yang persis sama.
  async function cekKalimatSama(jpText, excludeId = null) {
    const norm = normalisasiJP(jpText)
    if (!norm) return null
    const data = await cariBarisKemungkinanCocok([jpText], ['jp'], 'id, jp, paket:paket_id (nama, tanggal)', excludeId)
    const match = data.find(row => row.id !== excludeId && normalisasiJP(row.jp) === norm)
    if (!match) return null
    return { kata: match.jp, nama: match.paket?.nama, tanggal: match.paket?.tanggal }
  }

  // cek 1 atau lebih kata kandidat ke SELURUH database (jp Buku + kata_baru
  // Harian), lintas kedua sisi. Ngembaliin SEMUA match yang ketemu (bisa
  // lebih dari 1 paket), bukan cuma yang pertama -- biar reminder-nya bisa
  // nunjukin semua tempat kata itu udah pernah dicatet.
  async function cekDuplikatKata(kandidatList, excludeId = null) {
    const kandidat = kandidatList.map(normalisasiJP).filter(Boolean)
    if (kandidat.length === 0) return []
    const data = await cariBarisKemungkinanCocok(kandidatList, ['jp', 'kata_baru'], 'id, jp, kata_baru, paket:paket_id (nama, tanggal)', excludeId)
    const hasil = []
    const sudahAda = new Set()
    for (const row of data) {
      if (row.id === excludeId) continue
      const normJp = normalisasiJP(row.jp)
      if (kandidat.includes(normJp)) {
        const key = `${row.jp}|${row.paket?.nama}`
        if (!sudahAda.has(key)) { sudahAda.add(key); hasil.push({ kata: row.jp, nama: row.paket?.nama, tanggal: row.paket?.tanggal }) }
      }
      if (row.kata_baru) {
        const tagsRow = pecahKataBaru(row.kata_baru).map(normalisasiJP).filter(Boolean)
        tagsRow.forEach(t => {
          if (kandidat.includes(t)) {
            const key = `${t}|${row.paket?.nama}`
            if (!sudahAda.has(key)) { sudahAda.add(key); hasil.push({ kata: t, nama: row.paket?.nama, tanggal: row.paket?.tanggal }) }
          }
        })
      }
    }
    return hasil
  }

  // nulis ke DB doang, tanpa cek duplikat -- dipanggil dari simpanKata()
  // kalau lolos cek, ATAU dari tombol "Tetep Simpan" pas user override
  // warning kata (kalimat sama persis tetep TIDAK bisa di-override).
  // susun nilai Kata Baru yang disimpan: "聞=telinga, 見=lihat" (arti yang kosong -> kata aja)
  function gabungKataBaru(daftar = pecahKataBaru(kataBaruInput)) {
    const udah = new Set()
    return daftar.filter(w => !udah.has(w) && udah.add(w))
      .map(w => {
        const arti = (artiKata[w] || '').trim()
        const bentuk = (ubahKata[w]?.bentuk || '').trim()
        const jenis = ubahKata[w]?.jenis || ''
        if (bentuk || jenis) return `${w}=${arti}|${bentuk}|${jenis}`
        return arti ? `${w}=${arti}` : w
      }).join(', ')
  }

  async function simpanKataAktual(kataBaruOverride) {
    const sedangEdit = !!editingId
    if (editingId) {
      const { error } = await supabase.from('kata').update({
        jp: jp.trim(), arti: arti.trim(), bagian: bagianInput || '',
        contoh_kalimat: contohKalimat.trim(), bunshuu: bunshuu.trim(),
        konteks: konteks.trim(), nuansa: nuansa.trim(), kata_baru: kataBaruOverride ?? gabungKataBaru(),
        ...(sisiPaket === 'kiri' ? { plesetan: plesetan.trim() } : {}),
      }).eq('id', editingId)
      if (error) { alert('Gagal update: ' + error.message); return }
    } else {
      const { error } = await supabase.from('kata').insert({
        paket_id: paketId, jp: jp.trim(), arti: arti.trim(), bagian: bagianInput || '',
        contoh_kalimat: contohKalimat.trim(), bunshuu: bunshuu.trim(),
        konteks: konteks.trim(), nuansa: nuansa.trim(), kata_baru: kataBaruOverride ?? gabungKataBaru(), urutan: Date.now(),
        ...(sisiPaket === 'kiri' ? { plesetan: plesetan.trim() } : {}),
      })
      if (error) { alert('Gagal simpan: ' + error.message); return }
    }
    // abis simpan/update kata, form-nya sengaja TETEP kebuka (beda sama
    // form-form lain) biar bisa langsung nambah/edit kata berikutnya tanpa
    // buka form & pilih bagian dari awal lagi
    if (sedangEdit) {
      // abis update: form sebaris nutup, kartunya langsung kelihatan hasilnya; mode edit tetap nyala
      batalForm()
      muatSemua()
      return
    }
    resetFieldsKataSaja()
    muatSemua()
  }

  // "Oke, Saya Ingat" di sisi Harian: kalimat tetap disimpan, tapi kata yang udah pernah
  // dipelajari dibuang dari Kata Baru (kata lain di Kata Baru tetap ada)
  function kataBaruTanpaDuplikat(d) {
    const kunci = new Set((d?.matches || []).map(m => normalisasiJP(m.kata)))
    return gabungKataBaru(pecahKataBaru(kataBaruInput).filter(t => !kunci.has(normalisasiJP(t))))
  }

  async function simpanKata() {
    if (!jp.trim() || !arti.trim()) { alert('Isi kata JP dan artinya dulu ya!'); return }

    if (sisiPaket === 'kanan') {
      // kalimat yang sama persis SEKARANG BOLEH (misal sapaan/penutup yang
      // muncul lagi di episode lain). Cuma kata di Kata Baru yang masih
      // dikasih peringatan lunak di bawah.

      // kata di kata_baru -> SOFT WARNING, boleh di-override (kadang
      // emang sengaja belajar bentuk/konteks baru dari kata yang sama)
      const kandidatKata = pecahKataBaru(kataBaruInput)
      if (kandidatKata.length > 0) {
        const dupKata = await cekDuplikatKata(kandidatKata, editingId)
        if (dupKata.length > 0) { setDup({ mode: 'warn', matches: dupKata }); return }
      }
    } else {
      // sisi Buku: kata itu sendiri -> SOFT WARNING juga (bukan block),
      // soalnya alasan belajarnya beda: di Buku belajar bunshuu-nya, di
      // Harian belajar nuansa dari kalimatnya -- keduanya valid meski
      // kata-nya sama
      const dupKata = await cekDuplikatKata([jp.trim()], editingId)
      if (dupKata.length > 0) { setDup({ mode: 'warn', matches: dupKata }); return }
    }

    await simpanKataAktual()
  }

  // reset isian kata doang, form-nya TETEP kebuka & bagian yang lagi
  // dipilih TETEP kesimpen (beda sama batalForm yang nutup form total)
  function resetFieldsKataSaja() {
    setJp(''); setArti(''); setContohKalimat(''); setBunshuu(''); setPlesetan(''); setKonteks(''); setNuansa(''); setKataBaruInput(''); setArtiKata({}); setUbahKata({})
    setEditingId(null)
    setTimeout(() => jpInputRef.current?.focus(), 0)
  }

  function batalForm() {
    setJp(''); setArti(''); setContohKalimat(''); setBunshuu(''); setPlesetan(''); setKonteks(''); setNuansa(''); setKataBaruInput(''); setArtiKata({}); setUbahKata({}); setBagianInput('')
    setEditingId(null)
    setShowForm(false)
  }

  function toggleForm() {
    if (showForm) batalForm()
    else { tutupPanelLain(); setShowForm(true) }
  }

  async function tambahBagian() {
    tutupPanelLain()
    const nama = prompt('Nama bagian baru (contoh: Episode 1, 20 menit awal):')
    if (!nama || !nama.trim()) return
    const next = [...bagianList, nama.trim()]
    await supabase.from('paket').update({ bagian_list: next }).eq('id', paketId)
    muatSemua()
  }

  async function editBagian() {
    tutupPanelLain()
    if (bagianList.length === 0) { alert('Belum ada bagian!'); return }
    const pilih = prompt('Bagian mana yang mau di-rename?\n' + bagianList.map((b, i) => `${i + 1}. ${b}`).join('\n') + '\n\nKetik nomornya:')
    const idx = parseInt(pilih) - 1
    if (isNaN(idx) || idx < 0 || idx >= bagianList.length) return
    const namaBaru = prompt('Nama baru untuk "' + bagianList[idx] + '":', bagianList[idx])
    if (!namaBaru || !namaBaru.trim()) return
    const next = [...bagianList]
    const namaLama = next[idx]
    next[idx] = namaBaru.trim()
    await supabase.from('paket').update({ bagian_list: next }).eq('id', paketId)
    await supabase.from('kata').update({ bagian: namaBaru.trim() }).eq('paket_id', paketId).eq('bagian', namaLama)
    if (filterBagian === namaLama) setFilterBagian(namaBaru.trim())
    muatSemua()
  }

  async function hapusBagian() {
    tutupPanelLain()
    if (bagianList.length === 0) { alert('Belum ada bagian!'); return }
    const pilih = prompt('Bagian mana yang mau dihapus?\n' + bagianList.map((b, i) => `${i + 1}. ${b}`).join('\n') + '\n\nKetik nomornya:')
    const idx = parseInt(pilih) - 1
    if (isNaN(idx) || idx < 0 || idx >= bagianList.length) return
    const namaHapus = bagianList[idx]
    if (!confirm(`Hapus bagian "${namaHapus}"? Kata-katanya tidak ikut terhapus, tapi akan pindah ke tanpa bagian.`)) return
    const next = bagianList.filter((_, i) => i !== idx)
    await supabase.from('paket').update({ bagian_list: next }).eq('id', paketId)
    await supabase.from('kata').update({ bagian: '' }).eq('paket_id', paketId).eq('bagian', namaHapus)
    if (filterBagian === namaHapus) setFilterBagian('all')
    muatSemua()
  }

  function mulaiEditKata(k) {
    setEditingId(k.id)
    setJp(k.jp)
    setArti(k.arti)
    setContohKalimat(k.contoh_kalimat || '')
    setBunshuu(k.bunshuu || '')
    setPlesetan(k.plesetan || '')
    setKonteks(k.konteks || '')
    setNuansa(k.nuansa || '')
    const pasangan = parseKataBaru(k.kata_baru)
    setKataBaruInput(pasangan.map(x => x.kata).join('、'))
    setArtiKata(Object.fromEntries(pasangan.filter(x => x.arti).map(x => [x.kata, x.arti])))
    setUbahKata(Object.fromEntries(pasangan.filter(x => x.bentuk || x.jenis).map(x => [x.kata, { bentuk: x.bentuk, jenis: x.jenis }])))
    setBagianInput(k.bagian || '')
    setShowForm(true)
  }

  async function hapusKata(k) {
    if (!confirm(`Hapus "${k.jp}"?`)) return
    await supabase.from('kata').delete().eq('id', k.id)
    muatSemua()
  }

  async function resetHafalan() {
    tutupPanelLain()
    if (!confirm('Yakin mau reset semua hafalan di paket ini? Semua kata bakal balik jadi belum hafal.')) return
    await supabase.from('kata').update({ hafal: false }).eq('paket_id', paketId)
    muatSemua()
  }

  function tutupPanelLain() {
    batalForm()
    setEditMode(false)
    setHapusMode(false)
    setTes(null)
    setShowPdf(false)
    setShowDiary(false)
  }

  function bukaDiary() {
    tutupPanelLain()
    setShowDiary(true)
  }

  function klikKartu(k) {
    if (hapusMode) hapusKata(k)
    else if (editMode) mulaiEditKata(k)
    else if (pindahMode) { /* nggak ngapa-ngapain, drag-drop yang jalan */ }
    else toggleFlip(k.id)
  }

  // Form tambah/edit kata. sebaris = true -> dirender LANGSUNG di posisi kartu yang lagi diedit
  // (nggak perlu scroll ke atas); false -> di atas daftar (buat nambah kata baru).
  function renderFormKata(sebaris) {
    return (
        <div data-form-area ref={sebaris ? formSebarisRef : null}
          onKeyDown={e => { if (e.key === 'Escape' && editingId) batalForm() }}
          style={{ background: '#f0f7f0', borderRadius: 10, padding: 14, margin: sebaris ? '4px 0 8px' : '0 10px 10px', border: '1.5px solid #b8d8b8' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#2d6a4a', marginBottom: 8, letterSpacing: '.04em', textTransform: 'uppercase' }}>
            {editingId ? '✏️ Edit Kata' : '＋ Tambah Kata'}
          </div>
          {bagianList.length > 0 && (
            <select value={bagianInput} onChange={e => setBagianInput(e.target.value)}
              style={{ width: '100%', padding: 7, borderRadius: 8, border: '1.5px solid #b8d8b8', marginBottom: 8, fontSize: 12 }}>
              <option value="">— Semua (tanpa bagian) —</option>
              {bagianList.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {sisiPaket === 'kanan' ? (
              <>
                <input ref={jpInputRef} tabIndex={1} placeholder="Kalimat / ekspresi Jepang" value={jp} onChange={e => setJp(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && simpanKata()}
                  style={{ padding: 8, borderRadius: 8, border: '1.5px solid #b8d8b8', fontFamily: "'Noto Serif JP', serif", gridColumn: '1 / -1' }} />
                <input tabIndex={2} placeholder="Arti" value={arti} onChange={e => setArti(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && simpanKata()}
                  style={{ padding: 8, borderRadius: 8, border: '1.5px solid #b8d8b8', gridColumn: '1 / -1' }} />
                <input tabIndex={3} placeholder="Kata baru yang dipelajari, pisah koma Jepang 、 (opsional)" value={kataBaruInput} onChange={e => setKataBaruInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && simpanKata()}
                  style={{ padding: 8, borderRadius: 8, border: '1.5px solid #b8d8b8', fontFamily: "'Noto Serif JP', serif", gridColumn: '1 / -1' }} />
                {pecahKataBaru(kataBaruInput).length > 0 && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{ fontSize: 11, color: '#7a8a80', marginBottom: 4 }}>Arti tiap kata (opsional, ikut muncul di export hafalan). Kalau kata berubah bentuk di kalimat, isi bentuknya dan pilih jenisnya biar bisa dicari di kamus. Pakai Tab buat pindah.</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 8 }}>
                      {[...new Set(pecahKataBaru(kataBaruInput))].map(w => (
                        <div key={w} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 8, rowGap: 4, alignItems: 'center' }}>
                          <span style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 15, minWidth: 44 }}>{w}</span>
                          <input tabIndex={3} placeholder="arti" value={artiKata[w] || ''}
                            onChange={e => setArtiKata(prev => ({ ...prev, [w]: e.target.value.replace(/[,，、]/g, '/').replace(/[=＝|｜]/g, '') }))}
                            onKeyDown={e => e.key === 'Enter' && simpanKata()}
                            style={{ minWidth: 0, padding: 6, borderRadius: 8, border: '1.5px solid #b8d8b8', fontSize: 12 }} />
                          <span />
                          <div style={{ display: 'flex', gap: 6, minWidth: 0 }}>
                            <input tabIndex={3} placeholder="bentuk di kalimat" value={ubahKata[w]?.bentuk || ''}
                              onChange={e => setUbahKata(prev => ({ ...prev, [w]: { ...prev[w], bentuk: e.target.value.replace(/[,，、=＝|｜]/g, '') } }))}
                              onKeyDown={e => e.key === 'Enter' && simpanKata()}
                              style={{ flex: 1, minWidth: 0, padding: 6, borderRadius: 8, border: '1.5px solid #b8d8b8', fontSize: 13, fontFamily: "'Noto Serif JP', serif" }} />
                            <select tabIndex={3} value={ubahKata[w]?.jenis || ''}
                              onChange={e => setUbahKata(prev => ({ ...prev, [w]: { ...prev[w], jenis: e.target.value } }))}
                              style={{ padding: 6, borderRadius: 8, border: '1.5px solid #b8d8b8', fontSize: 12, maxWidth: 150 }}>
                              <option value="">jenis…</option>
                              {JENIS_PERUBAHAN.map(j => <option key={j.nilai} value={j.nilai}>{j.label}</option>)}
                            </select>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <input tabIndex={4} placeholder="Konteks / situasi (opsional)" value={konteks} onChange={e => setKonteks(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && simpanKata()}
                  style={{ padding: 8, borderRadius: 8, border: '1.5px solid #b8d8b8' }} />
                <input tabIndex={5} placeholder="Nuansa, misal: formal/kasual (opsional)" value={nuansa} onChange={e => setNuansa(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && simpanKata()}
                  style={{ padding: 8, borderRadius: 8, border: '1.5px solid #b8d8b8' }} />
              </>
            ) : (
              <>
                <input ref={jpInputRef} tabIndex={1} placeholder="Kata JP dasar (kanji/kana)" value={jp} onChange={e => setJp(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && simpanKata()}
                  style={{ padding: 8, borderRadius: 8, border: '1.5px solid #b8d8b8', fontFamily: "'Noto Serif JP', serif" }} />
                <input tabIndex={3} placeholder="Contoh kalimat (opsional)" value={contohKalimat} onChange={e => setContohKalimat(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && simpanKata()}
                  style={{ padding: 8, borderRadius: 8, border: '1.5px solid #b8d8b8', fontFamily: "'Noto Serif JP', serif" }} />
                <input tabIndex={2} placeholder="Arti ID" value={arti} onChange={e => setArti(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && simpanKata()}
                  style={{ padding: 8, borderRadius: 8, border: '1.5px solid #b8d8b8' }} />
                <input tabIndex={4} placeholder="Bunshuu, romaji (opsional)" value={bunshuu} onChange={e => setBunshuu(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && simpanKata()}
                  style={{ padding: 8, borderRadius: 8, border: '1.5px solid #b8d8b8' }} />
                <input tabIndex={5} placeholder="Plesetan Indo (opsional), misal: koro bu → kacang koro bu" value={plesetan} onChange={e => setPlesetan(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && simpanKata()}
                  style={{ padding: 8, borderRadius: 8, border: '1.5px solid #b8d8b8', gridColumn: '1 / -1' }} />
              </>
            )}
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <button tabIndex={6} className="act-btn active" onClick={simpanKata}
                  style={{ flex: 1, padding: 10, fontWeight: 600 }}>{editingId ? 'Update' : 'Simpan'}</button>
                {editingId && (
                  <button tabIndex={7} className="act-btn" onClick={batalForm}
                    style={{ padding: 10 }}>Batal</button>
                )}
              </div>
            </div>
          </div>
        </div>
    )
  }

  function renderKartu(k) {
    if (showForm && editingId === k.id) {
      return <div key={k.id} style={{ gridColumn: '1 / -1' }}>{renderFormKata(true)}</div>
    }
    const Komponen = sisiPaket === 'kanan' ? BarisKalimat : Kartu
    return (
      <Komponen
        key={k.id}
        k={k}
        isFlipped={flipped.has(k.id)}
        isDragging={draggingId === k.id}
        isDragOver={pindahMode && dragOverId === k.id && draggingId !== k.id}
        dragOverPos={dragOverPos}
        pindahMode={pindahMode}
        editMode={editMode}
        hapusMode={hapusMode}
        modeArtiDulu={modeArtiDulu}
        onClick={() => klikKartu(k)}
        onToggleHafal={toggleHafal}
        onDragStart={e => { setDraggingId(k.id); e.dataTransfer.effectAllowed = 'move' }}
        onDragEnd={() => { setDraggingId(null); setDragOverId(null) }}
        onDragOver={e => {
          if (pindahMode) {
            e.preventDefault(); e.stopPropagation()
            const rect = e.currentTarget.getBoundingClientRect()
            const posisi = sisiPaket === 'kanan'
              ? (e.clientY - rect.top) > rect.height / 2 ? 'after' : 'before'
              : (e.clientX - rect.left) > rect.width / 2 ? 'after' : 'before'
            setDragOverId(k.id); setDragOverPos(posisi)
          }
        }}
        onDragLeave={() => setDragOverId(id => (id === k.id ? null : id))}
        onDrop={e => {
          e.preventDefault()
          e.stopPropagation()
          if (pindahMode && draggingId) pindahKata(draggingId, k.bagian || '', k.id, dragOverPos)
          setDraggingId(null); setDragOverId(null)
        }}
      />
    )
  }

  function toggleRandom() {
    if (!random) {
      const map = new Map()
      shuffle(kataList).forEach((k, i) => map.set(k.id, i))
      setRandomOrder(map)
    }
    setRandom(r => !r)
  }
  function toggleSembunyikan() {
    setSembunyikan(s => { const next = !s; if (next) setTampilkanHafal(false); return next })
  }
  function toggleTampilkanHafal() {
    setTampilkanHafal(t => { const next = !t; if (next) setSembunyikan(false); return next })
  }
  function toggleEditMode() {
    setEditMode(e => {
      const next = !e
      if (next) { setHapusMode(false); setPindahMode(false); setPindahBagianMode(false); setTes(null); setShowPdf(false); batalForm() }
      else if (editingId) batalForm()
      return next
    })
  }
  function toggleHapusMode() {
    setHapusMode(h => {
      const next = !h
      if (next) { setEditMode(false); setPindahMode(false); setPindahBagianMode(false); setTes(null); setShowPdf(false); batalForm() }
      return next
    })
  }
  function togglePindahMode() {
    setPindahMode(p => {
      const next = !p
      if (next) { setEditMode(false); setHapusMode(false); setPindahBagianMode(false); setTes(null); setShowPdf(false); batalForm() }
      else { setDraggingId(null); setDragOverId(null) }
      return next
    })
  }
  function togglePindahBagianMode() {
    setPindahBagianMode(p => {
      const next = !p
      if (next) { setEditMode(false); setHapusMode(false); setPindahMode(false); setTes(null); setShowPdf(false); batalForm() }
      else { setDraggingBagian(null); setDragOverBagian(null) }
      return next
    })
  }

  async function pindahBagian(namaDrag, namaTarget) {
    if (namaDrag === namaTarget) return
    const list = [...bagianList]
    const dariIdx = list.indexOf(namaDrag)
    const keIdx = namaTarget ? list.indexOf(namaTarget) : list.length
    if (dariIdx === -1) return
    list.splice(dariIdx, 1)
    const idxSetelahHapus = namaTarget ? list.indexOf(namaTarget) : list.length
    list.splice(idxSetelahHapus, 0, namaDrag)
    setPaket(p => ({ ...p, bagian_list: list }))
    const { error } = await supabase.from('paket').update({ bagian_list: list }).eq('id', paketId)
    if (error) { alert('Gagal ngatur urutan bagian: ' + error.message); muatSemua() }
  }

  // urutan efektif: pakai kolom urutan kalau ada, kalau belum pernah
  // di-drag (masih null dari data lama) fallback ke waktu dibuat
  function urutanEfektif(k) {
    return k.urutan ?? new Date(k.created_at).getTime()
  }

  // pindahin kata ke bagian & posisi baru (drop di atas kata lain = sisip
  // sebelum kata itu; drop di area kosong bagian = taruh di akhir bagian)
  async function pindahKata(draggedId, targetBagian, targetId, posisi = 'before') {
    if (draggedId === targetId) return
    const dragged = kataList.find(k => k.id === draggedId)
    if (!dragged) return
    const items = kataList
      .filter(k => k.bagian === targetBagian && k.id !== draggedId)
      .sort((a, b) => urutanEfektif(a) - urutanEfektif(b))
    let targetIndex
    if (!targetId) {
      targetIndex = items.length // drop di area kosong -> taruh di akhir bagian
    } else {
      const idx = items.findIndex(k => k.id === targetId)
      // 'after' penting buat gerak ke KANAN -> kalau cuma "sisip sebelum
      // target" doang, mindahin ke tetangga kanan langsung nggak akan
      // kelihatan efeknya (balik lagi ke posisi semula)
      targetIndex = posisi === 'after' ? idx + 1 : idx
    }
    const before = items[targetIndex - 1]
    const after = items[targetIndex]
    const beforeU = before ? urutanEfektif(before) : (after ? urutanEfektif(after) - 1000 : Date.now())
    const afterU = after ? urutanEfektif(after) : beforeU + 1000
    const newUrutan = (beforeU + afterU) / 2
    setKataList(list => list.map(k => (k.id === draggedId ? { ...k, bagian: targetBagian, urutan: newUrutan } : k)))
    const { error } = await supabase.from('kata').update({ bagian: targetBagian, urutan: newUrutan }).eq('id', draggedId)
    if (error) { alert('Gagal pindahin kata: ' + error.message); muatSemua() }
  }

  const displayList = useMemo(() => {
    let list = kataList
    if (filterBagian !== 'all') list = list.filter(k => k.bagian === filterBagian)
    if (sembunyikan) list = list.filter(k => !k.hafal)
    if (tampilkanHafal) list = list.filter(k => k.hafal)
    if (random) list = [...list].sort((a, b) => (randomOrder.get(a.id) ?? 0) - (randomOrder.get(b.id) ?? 0))
    else list = [...list].sort((a, b) => urutanEfektif(a) - urutanEfektif(b))
    return list
  }, [kataList, filterBagian, sembunyikan, tampilkanHafal, random, randomOrder])

  function setKartu(mode) {
    setKartuMode(mode)
    if (mode === 'buka') setFlipped(new Set(displayList.map(k => k.id)))
    else setFlipped(new Set())
  }

  const groupedView = filterBagian === 'all' && bagianList.length > 0

  async function bukaPdf() {
    tutupPanelLain()
    if (!paket?.pdf_path) { setShowPdf(true); return }
    const sisi = await tentukanSisiStorage(paket)
    const { data, error } = await clientStorageUntuk(sisi).storage.from('immersion-pdfs').createSignedUrl(paket.pdf_path, 3600)
    if (error) { alert('Gagal ambil PDF: ' + error.message); return }
    setPdfUrl(data.signedUrl)
    setShowPdf(true)
  }
  async function uploadPdf(e) {
    const file = e.target.files[0]
    if (!file) return
    if (file.type !== 'application/pdf') { alert('File harus PDF ya!'); return }
    setUploading(true)
    const sisi = await tentukanSisiStorage(paket)
    const client = clientStorageUntuk(sisi)
    const pathLama = paket?.pdf_path || null
    const path = `${paketId}-${Date.now()}.pdf`
    const { error: upErr } = await client.storage.from('immersion-pdfs').upload(path, file, { upsert: true })
    if (upErr) { alert('Gagal upload: ' + upErr.message); setUploading(false); return }
    const { error: updErr } = await supabase.from('paket').update({ pdf_path: path }).eq('id', paketId)
    if (updErr) { alert('Gagal nyimpen path PDF: ' + updErr.message); setUploading(false); return }
    // upload baru & database udah sukses -- baru sekarang aman hapus file PDF lama
    // (kalau ada), biar nggak numpuk jadi orphan tiap kali ganti PDF
    if (pathLama && pathLama !== path) {
      const { error: hapusLamaErr } = await client.storage.from('immersion-pdfs').remove([pathLama])
      if (hapusLamaErr) console.error('Gagal hapus PDF lama:', hapusLamaErr.message)
    }
    const { data: signed, error: signErr } = await client.storage.from('immersion-pdfs').createSignedUrl(path, 3600)
    setUploading(false)
    if (signErr) { alert('Upload sukses, tapi gagal nampilin PDF-nya: ' + signErr.message); muatSemua(); return }
    setPdfUrl(signed.signedUrl)
    setShowPdf(true)
    muatSemua()
  }
async function hapusPdf() {
  if (paket.pdf_path) {
    const sisi = await tentukanSisiStorage(paket)
    await clientStorageUntuk(sisi).storage.from('immersion-pdfs').remove([paket.pdf_path])
  }
  await supabase.from('paket').update({ pdf_path: null }).eq('id', paketId)
  setShowPdf(false)
  muatSemua()
}

  function startTes(dir) {
    const sumber = (filterBagian !== 'all' ? kataList.filter(k => k.bagian === filterBagian) : kataList)
      .filter(k => !k.hafal)
      .filter(k => {
        if (dir === 'bunshuu-kanji') return !!k.bunshuu
        if (dir === 'natural-dasar') return !!k.contoh_kalimat
        if (dir === 'dasar-bunshuu') return !!k.bunshuu
        if (dir === 'plesetan-kanji-arti') return !!k.plesetan
        return true
      })
    if (sumber.length === 0) { alert('Tidak ada kata yang sesuai untuk mode tes ini!'); return }
    tutupPanelLain()
    const words = shuffle(sumber).map(k => ({ ...k, jp: jpMurni(k.jp) })) // tes TANPA romaji
    setTes({ dir, words, idx: 0, correct: 0, wrong: 0, hint: false, hintBenar: 0, benarIds: [], answered: false, input: '', input2: '', salah: false, salahKanji: false, salahArti: false, salahKanjiCount: 0, salahArtiCount: 0 })
  }
  // PEMANASAN kata (Harian): soal diambil dari kata di Kata Baru yang udah diisi artinya,
  // dari kalimat yang belum hafal. Cuma latihan: TIDAK mengubah status hafal apa pun.
  // Pakai mesin tes yang sama: jp = kata, arti = arti kata (dir: 'dasar-arti' = Kata -> Arti, 'arti-dasar' = Arti -> Kata)
  function startTesKata(dir) {
    const baris = (filterBagian !== 'all' ? kataList.filter(k => k.bagian === filterBagian) : kataList).filter(k => !k.hafal)
    const peta = new Map()
    baris.forEach(row => parseKataBaru(row.kata_baru).filter(x => x.arti).forEach(x => {
      const kunci = normalisasiJP(x.kata)
      const ada = peta.get(kunci)
      if (!ada) peta.set(kunci, { id: 'kata-' + kunci, jp: x.kata, arti: x.arti, kalimat: jpMurni(row.jp) })
      else if (!ada.arti.split('/').map(normalisasiID).includes(normalisasiID(x.arti))) ada.arti += '/' + x.arti
    }))
    const words = shuffle([...peta.values()])
    if (words.length === 0) { alert('Belum ada kata yang diisi artinya. Isi dulu arti tiap kata lewat form Edit Kata ya.'); return }
    tutupPanelLain()
    setTes({ dir, latihan: 'kata', words, idx: 0, correct: 0, wrong: 0, hint: false, hintBenar: 0, benarIds: [], answered: false, input: '', input2: '', salah: false, salahKanji: false, salahArti: false, salahKanjiCount: 0, salahArtiCount: 0 })
  }
  function tesCek() {
    if (!tes || tes.answered) return
    const w = tes.words[tes.idx]
    if (tes.dir === 'plesetan-kanji-arti') {
      const v1 = tes.input.trim()
      const v2 = (tes.input2 || '').trim()
      if (!v1 && !v2) return
      const kanjiBenar = v1 !== '' && normalisasiJP(v1) === normalisasiJP(w.jp)
      const artiBenar = v2 !== '' && w.arti.split(/[/;]/).map(normalisasiID).some(p => p === normalisasiID(v2))
      const semuaBenar = kanjiBenar && artiBenar
      setTes(t => ({
        ...t, answered: true, salah: !semuaBenar, salahKanji: !kanjiBenar, salahArti: !artiBenar,
        correct: t.correct + (semuaBenar ? 1 : 0), wrong: t.wrong + (semuaBenar ? 0 : 1),
        salahKanjiCount: t.salahKanjiCount + (kanjiBenar ? 0 : 1),
        salahArtiCount: t.salahArtiCount + (artiBenar ? 0 : 1),
        benarIds: semuaBenar ? [...t.benarIds, w.id] : t.benarIds,
      }))
      return
    }
    const val = tes.input.trim()
    if (!val) return
    let benar = false
    if (tes.dir === 'arti-dasar') {
      benar = normalisasiJP(val) === normalisasiJP(w.jp)
    } else if (tes.dir === 'bunshuu-kanji') {
      benar = normalisasiJP(val) === normalisasiJP(w.jp)
    } else if (tes.dir === 'dasar-arti') {
      benar = w.arti.split(/[/;]/).map(normalisasiID).some(p => p === normalisasiID(val))
    } else if (tes.dir === 'dasar-bunshuu') {
      benar = !!w.bunshuu && normalisasiID(val) === normalisasiID(w.bunshuu)
    } else if (tes.dir === 'natural-dasar') {
      benar = normalisasiJP(val) === normalisasiJP(w.jp)
    }
    const pakaiHint = !!tes.hint && !tes.latihan // pemanasan: hint bebas, nggak ada aturan "nggak dihitung"
    setTes(t => ({
      ...t, answered: true, salah: !benar,
      // benar TAPI pakai hint = nggak dihitung (nggak masuk skor, nggak otomatis hafal)
      correct: t.correct + (benar && !pakaiHint ? 1 : 0),
      wrong: t.wrong + (benar ? 0 : 1),
      hintBenar: (t.hintBenar || 0) + (benar && pakaiHint ? 1 : 0),
      benarIds: benar && !pakaiHint ? [...t.benarIds, w.id] : t.benarIds,
    }))
  }
  async function tesLanjut() {
    if (tes.idx + 1 >= tes.words.length) {
      if (!tes.latihan && tes.benarIds.length > 0) {
        await Promise.all(tes.benarIds.map(id => supabase.from('kata').update({ hafal: true }).eq('id', id)))
        catatAktivitasHariIni()
        muatSemua()
      }
      setTes(t => ({ ...t, idx: t.idx + 1 }))
    } else {
      setTes(t => ({ ...t, idx: t.idx + 1, hint: false, answered: false, input: '', input2: '', salah: false, salahKanji: false, salahArti: false }))
      setTimeout(() => kanjiTesRef.current?.focus(), 0)
    }
  }
  // ---- HINT tes ----
  // Kalimat berlubang: buang kanji-nya (batang kata, tanpa okurigana) dari kalimat contoh, ganti ＿.
  // Kalau nggak ketemu di kalimat -> null (hint kalimat nggak dikasih, daripada bocor).
  function lubangiKalimat(kata, kalimat) {
    if (!kata || !kalimat) return null
    let batang = /[\u4e00-\u9faf々]/.test(kata) ? kata.replace(/[ぁ-ゟァ-ヿー]+$/, '') : kata
    if (!batang) batang = kata
    return kalimat.includes(batang) ? kalimat.split(batang).join('＿') : null
  }
  // Hint cuma ada di: Kanji/Kata -> Arti (huruf pertama arti) dan Arti -> Kanji/Kata (kalimat berlubang).
  // Tes KALIMAT Harian (yang menentukan hafal) TANPA hint. Mode lain nggak ada hint.
  function buatHint(w, dir) {
    if (!w || (sisiPaket === 'kanan' && !tes?.latihan)) return null
    if (dir === 'dasar-arti') {
      const arti = String(w.arti || '').split(/[/;]/)[0].trim()
      return arti ? { jenis: 'huruf', teks: arti[0] + '…' } : null
    }
    if (dir === 'arti-dasar' || dir === 'bunshuu-kanji') {
      const kal = lubangiKalimat(w.jp, tes?.latihan ? w.kalimat : w.contoh_kalimat)
      return kal ? { jenis: 'kalimat', teks: kal } : null
    }
    return null
  }
  function tutupTes() { setTes(null); setShowRadikalTes(false) }

  if (!paket) return <div style={{ padding: 40, textAlign: 'center', color: '#9abaa8' }}>Memuat...</div>

  const kataUntukStats = filterBagian !== 'all' ? kataList.filter(k => k.bagian === filterBagian) : kataList
  const jumlahHafal = kataUntukStats.filter(k => k.hafal).length
  const selesai = tes && tes.idx >= tes.words.length

  return (
    <div>
      <style>{`
        .bagian-scroll::-webkit-scrollbar { height: 0; display: none; }
        .bagian-scroll { scrollbar-width: none; -ms-overflow-style: none; }
      `}</style>
      <div className="header-bar" style={{ flexWrap: 'nowrap', alignItems: 'center', gap: 10 }}>
        <div className="title" style={{ flexShrink: 0, marginTop: -2 }}>{paket.nama}</div>
        {bagianList.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: '1 1 auto' }}>
            <button
              className={`act-btn ${filterBagian === 'all' ? 'active' : ''}`}
              onClick={() => setFilterBagian('all')}
              style={{ flexShrink: 0 }}
            >Semua</button>

            {scrollState.canLeft && (
              <button onClick={() => geserBagian(-1)} title="Geser ke kiri" className="icon-btn" style={{ flexShrink: 0, width: 26, height: 26, marginRight: 3 }}>‹</button>
            )}
            <div
              ref={bagianScrollRef}
              className="bagian-scroll"
              onScroll={updateScrollState}
              style={{ display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto', flexWrap: 'nowrap', minWidth: 0, padding: '3px 4px', margin: '0 -4px' }}
            >
              {bagianList.map(b => (
                <button
                  key={b}
                  className={`act-btn ${filterBagian === b ? 'active' : ''}`}
                  data-pindah-item
                  onClick={() => { if (!pindahBagianMode) setFilterBagian(b) }}
                  draggable={pindahBagianMode}
                  onDragStart={e => { setDraggingBagian(b); e.dataTransfer.effectAllowed = 'move' }}
                  onDragEnd={() => { setDraggingBagian(null); setDragOverBagian(null) }}
                  onDragOver={e => { if (pindahBagianMode) { e.preventDefault(); setDragOverBagian(b) } }}
                  onDragLeave={() => setDragOverBagian(cur => (cur === b ? null : cur))}
                  onDrop={e => {
                    e.preventDefault()
                    if (pindahBagianMode && draggingBagian) pindahBagian(draggingBagian, b)
                    setDraggingBagian(null); setDragOverBagian(null)
                  }}
                  style={{
                    flexShrink: 0,
                    opacity: draggingBagian === b ? 0.4 : 1,
                    boxShadow: pindahBagianMode && dragOverBagian === b && draggingBagian !== b ? '0 0 0 2px #4a90d9' : pindahBagianMode ? '0 0 0 1.5px #cbb8e8' : undefined,
                    cursor: pindahBagianMode ? 'grab' : undefined,
                  }}
                >{b}</button>
              ))}
            </div>
            {scrollState.canRight && (
              <button onClick={() => geserBagian(1)} title="Geser ke kanan" className="icon-btn" style={{ flexShrink: 0, width: 26, height: 26, marginLeft: 3 }}>›</button>
            )}
          </div>
        )}
        <div className="stats" style={{ flexShrink: 0, marginLeft: 'auto', paddingLeft: 10 }}>{kataUntukStats.length} kata · ✓ {jumlahHafal} hafal</div>
        <button className="icon-btn" onClick={() => goTo('paket')} title="Kembali" style={{ flexShrink: 0 }}>←</button>
      </div>


      <div className="actions">
        <button className={`act-btn ${kartuMode === 'buka' ? 'active' : ''}`} onClick={() => setKartu('buka')}>Buka semua ▾</button>
        <button className={`act-btn ${kartuMode === 'tutup' ? 'active' : ''}`} onClick={() => setKartu('tutup')}>Tutup semua ▴</button>
        {sisiPaket === 'kanan' && (
          <button className={`act-btn ${modeArtiDulu ? 'active' : ''}`} onClick={() => setModeArtiDulu(m => !m)}>🔄 Arti dulu</button>
        )}
        <button className={`act-btn ${random ? 'active' : ''}`} onClick={toggleRandom}>🔀 Random</button>
        <button className={`act-btn ${sembunyikan ? 'active' : ''}`} onClick={toggleSembunyikan}>👁 Sembunyikan hafal</button>
        <button className={`act-btn ${tampilkanHafal ? 'active' : ''}`} onClick={toggleTampilkanHafal}>⭐ Hafal saja</button>
        <div style={{ position: 'relative' }} data-dropdown>
          <button className="act-btn" onClick={() => setShowTesBawah(s => !s)}>📝 Tes</button>
          {showTesBawah && (
            <div style={{ position: 'absolute', left: 0, top: 36, background: '#fff', border: '1.5px solid #ddd', borderRadius: 10, padding: 6, display: 'flex', flexDirection: 'column', gap: 4, boxShadow: '0 4px 16px rgba(0,0,0,.1)', zIndex: 20, minWidth: 200 }}>
              <div style={{ fontSize: 10, color: '#9abaa8', padding: '2px 6px', letterSpacing: '.06em', textTransform: 'uppercase' }}>Soal → Jawaban</div>
              {sisiPaket === 'kanan' ? (
                <>
                  <button className="act-btn" style={{ textAlign: 'left' }} onClick={() => { startTes('dasar-arti'); setShowTesBawah(false) }}>Kalimat → Arti</button>
                  <button className="act-btn" style={{ textAlign: 'left' }} onClick={() => { startTes('arti-dasar'); setShowTesBawah(false) }}>Arti → Kalimat</button>
                  <div style={{ height: 1, background: '#eee', margin: '2px 0' }} />
                  <div style={{ fontSize: 10, color: '#9abaa8', padding: '2px 6px', letterSpacing: '.06em', textTransform: 'uppercase' }}>Pemanasan (kata)</div>
                  <button className="act-btn" style={{ textAlign: 'left' }} onClick={() => { startTesKata('dasar-arti'); setShowTesBawah(false) }}>Kata → Arti</button>
                  <button className="act-btn" style={{ textAlign: 'left' }} onClick={() => { startTesKata('arti-dasar'); setShowTesBawah(false) }}>Arti → Kata</button>
                </>
              ) : (
                <>
                  <button className="act-btn" style={{ textAlign: 'left' }} onClick={() => { startTes('plesetan-kanji-arti'); setShowTesBawah(false) }}>Plesetan → Kanji + Arti</button>
                  <div style={{ height: 1, background: '#eee', margin: '2px 0' }} />
                  <button className="act-btn" style={{ textAlign: 'left' }} onClick={() => { startTes('arti-dasar'); setShowTesBawah(false) }}>Arti → Kanji Dasar</button>
                  <div style={{ height: 1, background: '#eee', margin: '2px 0' }} />
                  <button className="act-btn" style={{ textAlign: 'left' }} onClick={() => { startTes('bunshuu-kanji'); setShowTesBawah(false) }}>Bunshuu → Kanji Dasar</button>
                  <div style={{ height: 1, background: '#eee', margin: '2px 0' }} />
                  <button className="act-btn" style={{ textAlign: 'left' }} onClick={() => { startTes('dasar-arti'); setShowTesBawah(false) }}>Kanji Dasar → Arti</button>
                  <button className="act-btn" style={{ textAlign: 'left' }} onClick={() => { startTes('dasar-bunshuu'); setShowTesBawah(false) }}>Kanji Dasar → Bunshuu</button>
                  <div style={{ height: 1, background: '#eee', margin: '2px 0' }} />
                  <button className="act-btn" style={{ textAlign: 'left' }} onClick={() => { startTes('natural-dasar'); setShowTesBawah(false) }}>Contoh Kalimat → Kanji Dasar</button>
                </>
              )}
            </div>
          )}
        </div>
        <button className="act-btn" onClick={tambahBagian}>＋ Bagian</button>
        <button className={`act-btn ${showForm ? 'active' : ''}`} onClick={toggleForm}>{editingId ? '✏️ Edit Kata' : '＋ Kata'}</button>
        <button className={`act-btn ${paket.pdf_path ? 'active' : ''}`} onClick={bukaPdf} title={paket.pdf_path ? 'Lihat PDF' : 'Belum ada PDF'}>📄</button>
        <button className={`act-btn ${adaIsiDiary ? 'active' : ''}`} onClick={bukaDiary} title="Buku Diary">📔</button>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 'auto' }}>
        <ImportExcel mode="paket" sisi={sisiPaket} paketId={paketId} bagianList={bagianList} kataList={kataList} namaPaket={paket.nama} bagianAktif={filterBagian !== 'all' ? filterBagian : ''} onDone={muatSemua} kecil />
        <div style={{ position: 'relative' }} data-dropdown>
          <button className="act-btn" onClick={() => setShowMenu(m => !m)} title="Menu lainnya">⋯</button>
          {showMenu && (
            <div style={{
              position: 'absolute', right: 0, top: 36, background: '#fff', border: '1.5px solid #ddd',
              borderRadius: 10, padding: 6, display: 'flex', flexDirection: 'column', gap: 4,
              boxShadow: '0 4px 16px rgba(0,0,0,.1)', zIndex: 20, minWidth: 160,
            }}>
              <button className="act-btn" style={{ textAlign: 'left' }} onClick={() => { editBagian(); setShowMenu(false) }}>✏️ Edit Bagian</button>
              <button className={`act-btn ${pindahBagianMode ? 'active' : ''}`} style={{ textAlign: 'left' }} onClick={() => { togglePindahBagianMode(); setShowMenu(false) }}>🔀 Pindah Bagian</button>
              <button className="act-btn" style={{ textAlign: 'left', color: '#c0392b' }} onClick={() => { hapusBagian(); setShowMenu(false) }}>🗑️ Hapus Bagian</button>
              <div style={{ height: 1, background: '#eee', margin: '2px 0' }} />
              <button className={`act-btn ${editMode ? 'active' : ''}`} style={{ textAlign: 'left' }} onClick={() => { toggleEditMode(); setShowMenu(false) }}>✏️ Edit Kata</button>
              <button className={`act-btn ${pindahMode ? 'active' : ''}`} style={{ textAlign: 'left' }} onClick={() => { togglePindahMode(); setShowMenu(false) }}>🔀 Pindah Kata</button>
              <button className={`act-btn ${hapusMode ? 'active' : ''}`} style={{ textAlign: 'left' }} onClick={() => { toggleHapusMode(); setShowMenu(false) }}>🗑️ Hapus Kata</button>
              <div style={{ height: 1, background: '#eee', margin: '2px 0' }} />
              <button className="act-btn" style={{ textAlign: 'left', color: '#c0392b' }} onClick={() => { resetHafalan(); setShowMenu(false) }}>↺ Reset Hafalan</button>
            </div>
          )}
        </div>
        </div>
      </div>

      {showForm && (!editingId || !displayList.some(k => k.id === editingId)) && renderFormKata(false)}

      <div className="grid-wrap">
        {!groupedView && (
          <div
            className={`card-grid ${sisiPaket === "kanan" ? "kalimat" : ""}`}
            onDragOver={e => { if (pindahMode) e.preventDefault() }}
            onDrop={e => { e.preventDefault(); if (pindahMode && draggingId) pindahKata(draggingId, filterBagian !== 'all' ? filterBagian : '', null); setDraggingId(null); setDragOverId(null) }}
          >
            {displayList.map(k => renderKartu(k))}
          </div>
        )}
        {groupedView && (
          <>
            {displayList.filter(k => !k.bagian).length > 0 && (
              <div
                className={`card-grid ${sisiPaket === "kanan" ? "kalimat" : ""}`}
                style={{ marginBottom: 10 }}
                onDragOver={e => { if (pindahMode) e.preventDefault() }}
                onDrop={e => { e.preventDefault(); if (pindahMode && draggingId) pindahKata(draggingId, '', null); setDraggingId(null); setDragOverId(null) }}
              >
                {displayList.filter(k => !k.bagian).map(k => renderKartu(k))}
              </div>
            )}
            {bagianList.map(b => {
              const items = displayList.filter(k => k.bagian === b)
              if (items.length === 0) return null
              return (
                <div key={b} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#7aaa8a', padding: '8px 4px 4px' }}>{b}</div>
                  <div
                    className={`card-grid ${sisiPaket === "kanan" ? "kalimat" : ""}`}
                    onDragOver={e => { if (pindahMode) e.preventDefault() }}
                    onDrop={e => { e.preventDefault(); if (pindahMode && draggingId) pindahKata(draggingId, b, null); setDraggingId(null); setDragOverId(null) }}
                  >
                    {items.map(k => renderKartu(k))}
                  </div>
                </div>
              )
            })}
          </>
        )}
        {displayList.length === 0 && (
          <div style={{ textAlign: 'center', color: '#9abaa8', padding: 40, fontSize: 13 }}>
            Belum ada kata di sini.
          </div>
        )}
      </div>

      <div className={`modal-overlay ${dup ? 'open' : ''}`}>
        <div className="modal-box" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
          <div className="modal-icon">{dup?.mode === 'warn' ? '⚠️' : '🔁'}</div>
          <div className="modal-title">{dup?.mode === 'warn' ? 'Kata Ini Udah Pernah Dicatat' : 'Kalimat Ini Udah Pernah Dicatat!'}</div>
          <div className="modal-desc">
            {dup?.matches?.length === 1 ? (
              <><b>{dup.matches[0].kata}</b> udah ada di paket <b>{dup.matches[0].nama}{dup.matches[0].tanggal ? ` (${dup.matches[0].tanggal})` : ''}</b>.</>
            ) : (
              <>
                <b>{dup?.matches?.[0]?.kata}</b> udah ada di beberapa paket:
                <div style={{ maxHeight: 'min(38vh, 320px)', overflowY: 'auto', marginTop: 6, paddingRight: 4 }}>
                  <ul style={{ margin: '0 0 0 18px', padding: 0 }}>
                    {dup?.matches?.map((m, i) => <li key={i}><b>{m.nama}</b>{m.tanggal ? ` (${m.tanggal})` : ''}</li>)}
                  </ul>
                </div>
              </>
            )}
            <br /><br />
            {dup?.mode === 'warn'
              ? (sisiPaket === 'kanan'
                ? 'Coba inget dulu artinya. "Oke, Saya Ingat" = kalimat tetap disimpan, tapi kata ini nggak dicatat lagi di Kata Baru. "Tetep Simpan" = kalimat dan katanya sama-sama disimpan. 🌱'
                : 'Kan udah pernah dipelajarin semua bentuknya. Kalo emang sengaja mau catet konteks/nuansa baru dari kata ini, tetep boleh lanjut simpen. 🌱')
              : 'Ayo inget-inget! Ini active recall — coba diingat lagi artinya sebelum buka paket lamanya. 🌱'}
          </div>
          <div className="modal-btns">
            <button className={dup?.mode === 'warn' ? '' : 'confirm'} onClick={async () => {
              const d = dup
              setDup(null)
              if (d?.mode === 'warn' && sisiPaket === 'kanan') await simpanKataAktual(kataBaruTanpaDuplikat(d))
            }}>Oke, Saya Ingat</button>
            {dup?.mode === 'warn' && (
              <button className="confirm" onClick={async () => { setDup(null); await simpanKataAktual() }}>Tetep Simpan</button>
            )}
          </div>
        </div>
      </div>

{showPdf && (
  paket.pdf_path && pdfUrl ? (
<PdfHighlighter
  paketId={paketId}
  pdfPath={paket.pdf_path}
  pdfUrl={pdfUrl}
  onClose={() => setShowPdf(false)}
  onHapusPdf={hapusPdf}
/>
  ) : (
    <div className="pdf-panel">
      <div className="pdf-panel-header">
        <div style={{ flex: 1, fontWeight: 700, color: '#2d6a4a', fontSize: 13 }}>📄 {paket.nama}</div>
        <button className="icon-btn" onClick={() => setShowPdf(false)}>✕</button>
      </div>
      <div className="pdf-panel-body">
        <div style={{ textAlign: 'center', color: '#cde8d0', padding: 30 }}>
          <div style={{ fontSize: 40, marginBottom: 14 }}>📎</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Belum ada PDF di paket ini</div>
          <label style={{ display: 'inline-block', cursor: 'pointer', padding: '10px 20px', borderRadius: 10, background: '#2d6a4a', color: '#fff', fontSize: 13, fontWeight: 600 }}>
            {uploading ? 'Uploading...' : '＋ Upload PDF'}
            <input type="file" accept="application/pdf" onChange={uploadPdf} style={{ display: 'none' }} disabled={uploading} />
          </label>
        </div>
      </div>
    </div>
  )
)}

{showDiary && (
  <DiaryHalaman paketId={paketId} onClose={() => { setShowDiary(false); cekIsiDiary() }} />
)}

      {tes && (
        <div className="modal-overlay open">
          <div className="modal-box" style={{ maxWidth: tes.dir === 'natural-dasar' ? 560 : 380 }}>
            {tes.dir === 'dasar-bunshuu' && !selesai && (
              <RadicalPicker
                variant="panel"
                open={showRadikalTes}
                onToggle={() => setShowRadikalTes(s => !s)}
                onClose={() => setShowRadikalTes(false)}
                onPilih={(k) => setTes(t => ({ ...t, input: t.input + k }))}
              />
            )}
            {!selesai ? (
              <>
                <div style={{ fontSize: 11, color: '#9abaa8', marginBottom: 6 }}>{tes.idx + 1} / {tes.words.length} · ✓ {tes.correct} · ✗ {tes.wrong}{tes.latihan ? ' · 🔥 pemanasan' : ''}</div>
                {tes.dir === 'plesetan-kanji-arti' && (
                  <>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: '#9abaa8', marginBottom: 4 }}>Tulis Kanji & Artinya:</div>
                    <div style={{ fontSize: 22, fontWeight: 600, marginBottom: 14, textAlign: 'center' }}>{tes.words[tes.idx].plesetan}</div>
                    <input
                      ref={kanjiTesRef} autoFocus placeholder="Kanji / kana" value={tes.input} readOnly={tes.answered}
                      onChange={e => setTes(t => ({ ...t, input: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') { if (tes.answered) tesLanjut(); else artiTesRef.current?.focus() } }}
                      style={{
                        textAlign: 'center', fontSize: 18, fontFamily: "'Noto Serif JP', serif", width: '100%', boxSizing: 'border-box', marginBottom: 6,
                        borderColor: tes.answered ? (tes.salahKanji ? '#c0392b' : '#1e7d4f') : undefined,
                      }}
                    />
                    <input
                      ref={artiTesRef} placeholder="Artinya" value={tes.input2 || ''} readOnly={tes.answered}
                      onChange={e => setTes(t => ({ ...t, input2: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && (tes.answered ? tesLanjut() : tesCek())}
                      style={{
                        textAlign: 'center', fontSize: 18, width: '100%', boxSizing: 'border-box',
                        borderColor: tes.answered ? (tes.salahArti ? '#c0392b' : '#1e7d4f') : undefined,
                      }}
                    />
                    {tes.answered && (
                      <div style={{ textAlign: 'center', fontSize: 12, margin: '8px 0', lineHeight: 1.7 }}>
                        <div style={{ color: tes.salahKanji ? '#c0392b' : '#1e7d4f', fontWeight: 600 }}>
                          {tes.salahKanji ? '✗ Salah kanji' : '✓ Kanji benar'}
                          {tes.salahKanji && <span style={{ color: '#888', fontWeight: 400 }}> — jawaban: <b style={{ fontFamily: "'Noto Serif JP', serif" }}>{tes.words[tes.idx].jp}</b></span>}
                        </div>
                        <div style={{ color: tes.salahArti ? '#c0392b' : '#1e7d4f', fontWeight: 600 }}>
                          {tes.salahArti ? '✗ Salah arti' : '✓ Arti benar'}
                          {tes.salahArti && <span style={{ color: '#888', fontWeight: 400 }}> — jawaban: <b>{tes.words[tes.idx].arti}</b></span>}
                        </div>
                        {!tes.salah && <div style={{ color: '#1e7d4f' }}>Inget! 🎉</div>}
                      </div>
                    )}
                  </>
                )}
                {tes.dir !== 'plesetan-kanji-arti' && (<>
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: '#9abaa8', marginBottom: 4 }}>
                  {sisiPaket === 'kanan'
                    ? { 'arti-dasar': tes.latihan ? 'Tulis Katanya:' : 'Tulis Kalimatnya:', 'dasar-arti': 'Tulis Artinya:' }[tes.dir]
                    : { 'arti-dasar': 'Tulis Kanji Dasarnya:', 'bunshuu-kanji': 'Tulis Kanji Dasarnya:', 'dasar-arti': 'Tulis Artinya:', 'dasar-bunshuu': 'Tulis Bunshuu-nya:', 'natural-dasar': 'Tulis Kanji Dasarnya:' }[tes.dir]}
                </div>
                <div style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 24, fontWeight: 600, marginBottom: 14, textAlign: 'center' }}>
                  {{ 'arti-dasar': tes.words[tes.idx].arti, 'bunshuu-kanji': tes.words[tes.idx].bunshuu, 'dasar-arti': tes.words[tes.idx].jp, 'dasar-bunshuu': tes.words[tes.idx].jp, 'natural-dasar': tes.words[tes.idx].contoh_kalimat }[tes.dir]}
                </div>
                <input
                  autoFocus value={tes.input} disabled={tes.answered}
                  onChange={e => setTes(t => ({ ...t, input: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && (tes.answered ? tesLanjut() : tesCek())}
                  style={{
                    textAlign: 'center', fontSize: 18,
                    fontFamily: ['arti-dasar','bunshuu-kanji','natural-dasar'].includes(tes.dir) ? "'Noto Serif JP', serif" : 'inherit',
                    borderColor: tes.answered ? (tes.salah ? '#c0392b' : '#1e7d4f') : undefined,
                    width: (tes.dir === 'natural-dasar' || (sisiPaket === 'kanan' && !tes.latihan && tes.dir === 'arti-dasar')) ? '100%' : undefined,
                    boxSizing: (tes.dir === 'natural-dasar' || (sisiPaket === 'kanan' && !tes.latihan && tes.dir === 'arti-dasar')) ? 'border-box' : undefined,
                  }}
                />
                {!tes.answered && (() => {
                  const h = buatHint(tes.words[tes.idx], tes.dir)
                  if (!h) return null
                  return tes.hint ? (
                    <div style={{ textAlign: 'center', margin: '10px 0', fontSize: 14, color: '#7a6a2a', background: '#fff8e1', borderRadius: 8, padding: '6px 10px' }}>
                      💡 {h.jenis === 'huruf' ? 'Huruf pertama: ' : 'Kalimat: '}
                      <span style={{ fontFamily: h.jenis === 'kalimat' ? "'Noto Serif JP', serif" : 'inherit', fontWeight: 600 }}>{h.teks}</span>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', margin: '10px 0' }}>
                      <button type="button" className="act-btn" style={{ fontSize: 12 }} onClick={() => setTes(t => ({ ...t, hint: true }))}>💡 Hint</button>
                      {!tes.latihan && <div style={{ fontSize: 10, color: '#9abaa8', marginTop: 3 }}>kalau dipakai, jawaban benar nggak dihitung</div>}
                    </div>
                  )
                })()}
                {tes.answered && !tes.salah && tes.hint && !tes.latihan && (
                  <div style={{ textAlign: 'center', fontSize: 12, color: '#7a6a2a', marginBottom: 8 }}>💡 Benar, tapi pakai hint, jadi nggak dihitung</div>
                )}
                {tes.answered && tes.salah && (
                  <div style={{ textAlign: 'center', fontSize: 12, color: '#888', marginBottom: 8 }}>
                    Jawaban: <b>
                      {{ 'arti-dasar': tes.words[tes.idx].jp, 'bunshuu-kanji': tes.words[tes.idx].jp, 'dasar-arti': tes.words[tes.idx].arti, 'dasar-bunshuu': tes.words[tes.idx].bunshuu, 'natural-dasar': tes.words[tes.idx].jp }[tes.dir]}
                    </b>
                  </div>
                )}
                {tes.latihan && tes.answered && (
                  <div style={{ textAlign: 'center', fontSize: 11, color: '#7a8a80', marginBottom: 8 }}>
                    dari kalimat: <span style={{ fontFamily: "'Noto Serif JP', serif" }}>{tes.words[tes.idx].kalimat}</span>
                  </div>
                )}
                </>)}
                <div className="modal-btns">
                  <button onClick={tutupTes}>Tutup</button>
                  <button className="confirm" onClick={tes.answered ? tesLanjut : tesCek}>
                    {tes.answered ? (tes.idx + 1 >= tes.words.length ? 'Lihat Hasil' : 'Lanjut →') : 'Cek Jawaban'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 36, textAlign: 'center', marginBottom: 6 }}>{tes.correct / tes.words.length >= 0.8 ? '🎉' : tes.correct / tes.words.length >= 0.5 ? '💪' : '📚'}</div>
                <div style={{ fontSize: 32, fontWeight: 700, textAlign: 'center', marginBottom: 6 }}>{tes.correct}/{tes.words.length}</div>
                <div style={{ fontSize: 12, color: '#9abaa8', textAlign: 'center', marginBottom: 14 }}>
                  {tes.latihan ? 'Pemanasan aja, status hafal nggak berubah. Tes kalimat yang menentukan 💪' : tes.benarIds.length > 0 ? `${tes.benarIds.length} kata otomatis diceklis hafal ✓` : tes.hintBenar > 0 ? 'Yang benar tadi pakai hint, jadi belum ada yang otomatis hafal.' : 'Belum ada yang benar, coba lagi!'}
                </div>
                {tes.hintBenar > 0 && (
                  <div style={{ fontSize: 12, color: '#7a6a2a', textAlign: 'center', marginBottom: 14 }}>💡 {tes.hintBenar} jawaban benar pakai hint, nggak dihitung</div>
                )}
                {tes.dir === 'plesetan-kanji-arti' && tes.wrong > 0 && (
                  <div style={{ fontSize: 12, color: '#888', textAlign: 'center', marginBottom: 14 }}>
                    Salah kanji: <b>{tes.salahKanjiCount}</b> · Salah arti: <b>{tes.salahArtiCount}</b>
                  </div>
                )}
                <div className="modal-btns">
                  <button onClick={tutupTes}>Selesai</button>
                  <button className="confirm" onClick={() => (tes.latihan ? startTesKata(tes.dir) : startTes(tes.dir))}>Ulangi</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
