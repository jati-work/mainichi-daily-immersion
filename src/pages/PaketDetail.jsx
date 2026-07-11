import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import PdfHighlighter from './PdfHighlighter'
import DiaryHalaman from './DiaryHalaman'
import RadicalPicker from './RadicalPicker'

function normalisasiJP(s) {
  return String(s).trim().toLowerCase().replace(/[\s、。！？・「」]/g, '').normalize('NFKC')
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

export default function PaketDetail({ paketId, goTo }) {
  const [paket, setPaket] = useState(null)
  const [kataList, setKataList] = useState([])
  const [flipped, setFlipped] = useState(new Set())
  const [showForm, setShowForm] = useState(false)
  const [jp, setJp] = useState('')
  const [arti, setArti] = useState('')
  const [contohKalimat, setContohKalimat] = useState('')
  const [bunshuu, setBunshuu] = useState('')
  const [bagianInput, setBagianInput] = useState('')
  const [dup, setDup] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const jpInputRef = useRef(null)
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
  const [showMenu, setShowMenu] = useState(false)
  const [showTesBawah, setShowTesBawah] = useState(false)

  useEffect(() => {
  function handleClickOutside(e) {
    if (!e.target.closest('[data-dropdown]')) {
      setShowMenu(false)
      setShowTesBawah(false)
    }
    if (!e.target.closest('[data-form-area]') && !e.target.closest('.card') && !e.target.closest('.modal-overlay')) {
      batalForm()
      setEditMode(false)
      setHapusMode(false)
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
    const { data: k } = await supabase.from('kata').select('*').eq('paket_id', paketId).order('created_at')
    setKataList(k || [])
  }
  async function cekIsiDiary() {
    const { data } = await supabase.from('diary_pages').select('isi_teks').eq('paket_id', paketId)
    setAdaIsiDiary((data || []).some(d => d.isi_teks && d.isi_teks.trim().length > 0))
  }
  useEffect(() => { muatSemua(); cekIsiDiary() }, [paketId])

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

  async function toggleHafal(k) {
    await supabase.from('kata').update({ hafal: !k.hafal }).eq('id', k.id)
    muatSemua()
  }

  async function cekDuplikat(jpText, excludeId = null) {
    const norm = normalisasiJP(jpText)
    if (!norm) return null
    const { data } = await supabase.from('kata').select('id, jp, paket:paket_id (nama, tanggal)')
    if (!data) return null
    const match = data.find(row => row.id !== excludeId && normalisasiJP(row.jp) === norm)
    if (!match) return null
    return { jp: match.jp, nama: match.paket?.nama, tanggal: match.paket?.tanggal }
  }

  async function simpanKata() {
    if (!jp.trim() || !arti.trim()) { alert('Isi kata JP dan artinya dulu ya!'); return }
    const ketemu = await cekDuplikat(jp, editingId)
    if (ketemu) { setDup(ketemu); return }
    if (editingId) {
      const { error } = await supabase.from('kata').update({
        jp: jp.trim(), arti: arti.trim(), bagian: bagianInput || '',
        contoh_kalimat: contohKalimat.trim(), bunshuu: bunshuu.trim(),
      }).eq('id', editingId)
      if (error) { alert('Gagal update: ' + error.message); return }
    } else {
      const { error } = await supabase.from('kata').insert({
        paket_id: paketId, jp: jp.trim(), arti: arti.trim(), bagian: bagianInput || '',
        contoh_kalimat: contohKalimat.trim(), bunshuu: bunshuu.trim(),
      })
      if (error) { alert('Gagal simpan: ' + error.message); return }
    }
    // abis simpan/update kata, form-nya sengaja TETEP kebuka (beda sama
    // form-form lain) biar bisa langsung nambah/edit kata berikutnya tanpa
    // buka form & pilih bagian dari awal lagi
    resetFieldsKataSaja()
    muatSemua()
  }

  // reset isian kata doang, form-nya TETEP kebuka & bagian yang lagi
  // dipilih TETEP kesimpen (beda sama batalForm yang nutup form total)
  function resetFieldsKataSaja() {
    setJp(''); setArti(''); setContohKalimat(''); setBunshuu('')
    setEditingId(null)
    setTimeout(() => jpInputRef.current?.focus(), 0)
  }

  function batalForm() {
    setJp(''); setArti(''); setContohKalimat(''); setBunshuu(''); setBagianInput('')
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
    else toggleFlip(k.id)
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
      if (next) { setHapusMode(false); setTes(null); setShowPdf(false); batalForm() }
      else if (editingId) batalForm()
      return next
    })
  }
  function toggleHapusMode() {
    setHapusMode(h => {
      const next = !h
      if (next) { setEditMode(false); setTes(null); setShowPdf(false); batalForm() }
      return next
    })
  }

  const displayList = useMemo(() => {
    let list = kataList
    if (filterBagian !== 'all') list = list.filter(k => k.bagian === filterBagian)
    if (sembunyikan) list = list.filter(k => !k.hafal)
    if (tampilkanHafal) list = list.filter(k => k.hafal)
    if (random) list = [...list].sort((a, b) => (randomOrder.get(a.id) ?? 0) - (randomOrder.get(b.id) ?? 0))
    return list
  }, [kataList, filterBagian, sembunyikan, tampilkanHafal, random, randomOrder])

  function setKartu(mode) {
    setKartuMode(mode)
    if (mode === 'buka') setFlipped(new Set(displayList.map(k => k.id)))
    else setFlipped(new Set())
  }

  const groupedView = filterBagian === 'all' && bagianList.length > 0

  function Kartu({ k }) {
    const isFlipped = flipped.has(k.id)
    return (
      <div className={`card ${isFlipped ? 'flipped' : ''} ${k.hafal ? 'hafal' : ''}`}>
        <div
          className="card-inner" onClick={() => klikKartu(k)}
          style={{ boxShadow: editMode ? '0 0 0 2px #7aaa8a' : hapusMode ? '0 0 0 2px #f0a8a0' : 'none' }}
        >
          <div className="card-front">
            <div>{k.jp}</div>
          </div>
          <div className="card-back">
            <div>{k.arti}</div>
          </div>
        </div>
        <button className="hafal-toggle" onClick={(e) => { e.stopPropagation(); toggleHafal(k) }}>✓</button>
      </div>
    )
  }

  async function bukaPdf() {
    tutupPanelLain()
    if (!paket?.pdf_path) { setShowPdf(true); return }
    const { data, error } = await supabase.storage.from('immersion-pdfs').createSignedUrl(paket.pdf_path, 3600)
    if (error) { alert('Gagal ambil PDF: ' + error.message); return }
    setPdfUrl(data.signedUrl)
    setShowPdf(true)
  }
  async function uploadPdf(e) {
    const file = e.target.files[0]
    if (!file) return
    if (file.type !== 'application/pdf') { alert('File harus PDF ya!'); return }
    setUploading(true)
    const path = `${paketId}-${Date.now()}.pdf`
    const { error: upErr } = await supabase.storage.from('immersion-pdfs').upload(path, file, { upsert: true })
    if (upErr) { alert('Gagal upload: ' + upErr.message); setUploading(false); return }
    const { error: updErr } = await supabase.from('paket').update({ pdf_path: path }).eq('id', paketId)
    if (updErr) { alert('Gagal nyimpen path PDF: ' + updErr.message); setUploading(false); return }
    const { data: signed, error: signErr } = await supabase.storage.from('immersion-pdfs').createSignedUrl(path, 3600)
    setUploading(false)
    if (signErr) { alert('Upload sukses, tapi gagal nampilin PDF-nya: ' + signErr.message); muatSemua(); return }
    setPdfUrl(signed.signedUrl)
    setShowPdf(true)
    muatSemua()
  }
async function hapusPdf() {
  if (paket.pdf_path) await supabase.storage.from('immersion-pdfs').remove([paket.pdf_path])
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
        return true
      })
    if (sumber.length === 0) { alert('Tidak ada kata yang sesuai untuk mode tes ini!'); return }
    tutupPanelLain()
    const words = shuffle(sumber)
    setTes({ dir, words, idx: 0, correct: 0, wrong: 0, benarIds: [], answered: false, input: '', salah: false })
  }
  function tesCek() {
    if (!tes || tes.answered) return
    const w = tes.words[tes.idx]
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
    setTes(t => ({
      ...t, answered: true, salah: !benar,
      correct: t.correct + (benar ? 1 : 0),
      wrong: t.wrong + (benar ? 0 : 1),
      benarIds: benar ? [...t.benarIds, w.id] : t.benarIds,
    }))
  }
  async function tesLanjut() {
    if (tes.idx + 1 >= tes.words.length) {
      if (tes.benarIds.length > 0) {
        await Promise.all(tes.benarIds.map(id => supabase.from('kata').update({ hafal: true }).eq('id', id)))
        muatSemua()
      }
      setTes(t => ({ ...t, idx: t.idx + 1 }))
    } else {
      setTes(t => ({ ...t, idx: t.idx + 1, answered: false, input: '', salah: false }))
    }
  }
  function tutupTes() { setTes(null); setShowRadikalTes(false) }

  if (!paket) return <div style={{ padding: 40, textAlign: 'center', color: '#9abaa8' }}>Memuat...</div>

  const jumlahHafal = kataList.filter(k => k.hafal).length
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
              <button onClick={() => geserBagian(-1)} title="Geser ke kiri" className="icon-btn" style={{ flexShrink: 0, width: 26, height: 26 }}>‹</button>
            )}
            <div
              ref={bagianScrollRef}
              className="bagian-scroll"
              onScroll={updateScrollState}
              style={{ display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto', flexWrap: 'nowrap', minWidth: 0, padding: '3px 4px' }}
            >
              {bagianList.map(b => (
                <button
                  key={b}
                  className={`act-btn ${filterBagian === b ? 'active' : ''}`}
                  onClick={() => setFilterBagian(b)}
                  style={{ flexShrink: 0 }}
                >{b}</button>
              ))}
            </div>
            {scrollState.canRight && (
              <button onClick={() => geserBagian(1)} title="Geser ke kanan" className="icon-btn" style={{ flexShrink: 0, width: 26, height: 26 }}>›</button>
            )}
          </div>
        )}
        <div className="stats" style={{ flexShrink: 0, marginLeft: 'auto', paddingLeft: 10 }}>{kataList.length} kata · ✓ {jumlahHafal} hafal</div>
        <button className="icon-btn" onClick={() => goTo('paket')} title="Kembali" style={{ flexShrink: 0 }}>←</button>
      </div>


      <div className="actions">
        <button className={`act-btn ${kartuMode === 'buka' ? 'active' : ''}`} onClick={() => setKartu('buka')}>Buka semua ▾</button>
        <button className={`act-btn ${kartuMode === 'tutup' ? 'active' : ''}`} onClick={() => setKartu('tutup')}>Tutup semua ▴</button>
        <button className={`act-btn ${random ? 'active' : ''}`} onClick={toggleRandom}>🔀 Random</button>
        <button className={`act-btn ${sembunyikan ? 'active' : ''}`} onClick={toggleSembunyikan}>👁 Sembunyikan hafal</button>
        <button className={`act-btn ${tampilkanHafal ? 'active' : ''}`} onClick={toggleTampilkanHafal}>⭐ Hafal saja</button>
        <div style={{ position: 'relative' }} data-dropdown>
          <button className="act-btn" onClick={() => setShowTesBawah(s => !s)}>📝 Tes</button>
          {showTesBawah && (
            <div style={{ position: 'absolute', left: 0, top: 36, background: '#fff', border: '1.5px solid #ddd', borderRadius: 10, padding: 6, display: 'flex', flexDirection: 'column', gap: 4, boxShadow: '0 4px 16px rgba(0,0,0,.1)', zIndex: 20, minWidth: 200 }}>
              <div style={{ fontSize: 10, color: '#9abaa8', padding: '2px 6px', letterSpacing: '.06em', textTransform: 'uppercase' }}>Soal → Jawaban</div>
              <button className="act-btn" style={{ textAlign: 'left' }} onClick={() => { startTes('arti-dasar'); setShowTesBawah(false) }}>Arti → Kanji Dasar</button>
              <div style={{ height: 1, background: '#eee', margin: '2px 0' }} />
              <button className="act-btn" style={{ textAlign: 'left' }} onClick={() => { startTes('bunshuu-kanji'); setShowTesBawah(false) }}>Bunshuu → Kanji Dasar</button>
              <div style={{ height: 1, background: '#eee', margin: '2px 0' }} />
              <button className="act-btn" style={{ textAlign: 'left' }} onClick={() => { startTes('dasar-arti'); setShowTesBawah(false) }}>Kanji Dasar → Arti</button>
              <button className="act-btn" style={{ textAlign: 'left' }} onClick={() => { startTes('dasar-bunshuu'); setShowTesBawah(false) }}>Kanji Dasar → Bunshuu</button>
              <div style={{ height: 1, background: '#eee', margin: '2px 0' }} />
              <button className="act-btn" style={{ textAlign: 'left' }} onClick={() => { startTes('natural-dasar'); setShowTesBawah(false) }}>Contoh Kalimat → Kanji Dasar</button>
            </div>
          )}
        </div>
        <button className="act-btn" onClick={tambahBagian}>＋ Bagian</button>
        <button className={`act-btn ${showForm ? 'active' : ''}`} onClick={toggleForm}>{editingId ? '✏️ Edit Kata' : '＋ Kata'}</button>
        <button className={`act-btn ${paket.pdf_path ? 'active' : ''}`} onClick={bukaPdf} title={paket.pdf_path ? 'Lihat PDF' : 'Belum ada PDF'}>📄</button>
        <button className={`act-btn ${adaIsiDiary ? 'active' : ''}`} onClick={bukaDiary} title="Buku Diary">📔</button>
        <div style={{ position: 'relative', marginLeft: 'auto' }} data-dropdown>
          <button className="act-btn" onClick={() => setShowMenu(m => !m)} title="Menu lainnya">⋯</button>
          {showMenu && (
            <div style={{
              position: 'absolute', right: 0, top: 36, background: '#fff', border: '1.5px solid #ddd',
              borderRadius: 10, padding: 6, display: 'flex', flexDirection: 'column', gap: 4,
              boxShadow: '0 4px 16px rgba(0,0,0,.1)', zIndex: 20, minWidth: 160,
            }}>
              <button className="act-btn" style={{ textAlign: 'left' }} onClick={() => { editBagian(); setShowMenu(false) }}>✏️ Edit Bagian</button>
              <button className="act-btn" style={{ textAlign: 'left', color: '#c0392b' }} onClick={() => { hapusBagian(); setShowMenu(false) }}>🗑️ Hapus Bagian</button>
              <div style={{ height: 1, background: '#eee', margin: '2px 0' }} />
              <button className={`act-btn ${editMode ? 'active' : ''}`} style={{ textAlign: 'left' }} onClick={() => { toggleEditMode(); setShowMenu(false) }}>✏️ Edit Kata</button>
              <button className={`act-btn ${hapusMode ? 'active' : ''}`} style={{ textAlign: 'left' }} onClick={() => { toggleHapusMode(); setShowMenu(false) }}>🗑️ Hapus Kata</button>
              <div style={{ height: 1, background: '#eee', margin: '2px 0' }} />
              <button className="act-btn" style={{ textAlign: 'left', color: '#c0392b' }} onClick={() => { resetHafalan(); setShowMenu(false) }}>↺ Reset Hafalan</button>
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <div data-form-area style={{ background: '#f0f7f0', borderRadius: 10, padding: 14, margin: '0 10px 10px', border: '1.5px solid #b8d8b8' }}>
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
            <div style={{ gridColumn: '1 / -1' }}>
              <button tabIndex={5} className="act-btn active" onClick={simpanKata}
                style={{ width: '100%', padding: 10, fontWeight: 600 }}>{editingId ? 'Update' : 'Simpan'}</button>
            </div>
          </div>
        </div>
      )}

      <div className="grid-wrap">
        {!groupedView && (
          <div className="card-grid">
            {displayList.map(k => <Kartu key={k.id} k={k} />)}
          </div>
        )}
        {groupedView && (
          <>
            {displayList.filter(k => !k.bagian).length > 0 && (
              <div className="card-grid" style={{ marginBottom: 10 }}>
                {displayList.filter(k => !k.bagian).map(k => <Kartu key={k.id} k={k} />)}
              </div>
            )}
            {bagianList.map(b => {
              const items = displayList.filter(k => k.bagian === b)
              if (items.length === 0) return null
              return (
                <div key={b} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#7aaa8a', padding: '8px 4px 4px' }}>{b}</div>
                  <div className="card-grid">
                    {items.map(k => <Kartu key={k.id} k={k} />)}
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
        <div className="modal-box">
          <div className="modal-icon">🔁</div>
          <div className="modal-title">Kata Ini Udah Pernah Dicatat!</div>
          <div className="modal-desc">
            Kata ini udah ada di paket <b>{dup?.nama}{dup?.tanggal ? ` (${dup.tanggal})` : ''}</b>.<br /><br />
            Ayo inget-inget! Ini active recall — coba diingat lagi artinya sebelum buka paket lamanya. 🌱
          </div>
          <div className="modal-btns">
            <button className="confirm" onClick={() => setDup(null)}>Oke, Saya Ingat</button>
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
                <div style={{ fontSize: 11, color: '#9abaa8', marginBottom: 6 }}>{tes.idx + 1} / {tes.words.length} · ✓ {tes.correct} · ✗ {tes.wrong}</div>
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: '#9abaa8', marginBottom: 4 }}>
                  {{ 'arti-dasar': 'Tulis Kanji Dasarnya:', 'bunshuu-kanji': 'Tulis Kanji Dasarnya:', 'dasar-arti': 'Tulis Artinya:', 'dasar-bunshuu': 'Tulis Bunshuu-nya:', 'natural-dasar': 'Tulis Kanji Dasarnya:' }[tes.dir]}
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
                    width: tes.dir === 'natural-dasar' ? '100%' : undefined,
                    boxSizing: tes.dir === 'natural-dasar' ? 'border-box' : undefined,
                  }}
                />
                {tes.answered && tes.salah && (
                  <div style={{ textAlign: 'center', fontSize: 12, color: '#888', marginBottom: 8 }}>
                    Jawaban: <b>
                      {{ 'arti-dasar': tes.words[tes.idx].jp, 'bunshuu-kanji': tes.words[tes.idx].jp, 'dasar-arti': tes.words[tes.idx].arti, 'dasar-bunshuu': tes.words[tes.idx].bunshuu, 'natural-dasar': tes.words[tes.idx].jp }[tes.dir]}
                    </b>
                  </div>
                )}
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
                  {tes.benarIds.length > 0 ? `${tes.benarIds.length} kata otomatis diceklis hafal ✓` : 'Belum ada yang benar, coba lagi!'}
                </div>
                <div className="modal-btns">
                  <button onClick={tutupTes}>Selesai</button>
                  <button className="confirm" onClick={() => startTes(tes.dir)}>Ulangi</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
