import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'

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
  const [bagianInput, setBagianInput] = useState('')
  const [dup, setDup] = useState(null)
  const [showPdf, setShowPdf] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [pdfUrl, setPdfUrl] = useState(null)

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

  // ----- tes (quiz) -----
  const [tes, setTes] = useState(null)

  async function muatSemua() {
    const { data: p } = await supabase.from('paket').select('*').eq('id', paketId).single()
    setPaket(p)
    const { data: k } = await supabase.from('kata').select('*').eq('paket_id', paketId).order('created_at')
    setKataList(k || [])
  }
  useEffect(() => { muatSemua() }, [paketId])

  const bagianList = paket?.bagian_list || []

function toggleFlip(id) {
  const next = new Set(flipped)
  if (next.has(id)) next.delete(id); else next.add(id)
  setFlipped(next)
  setKartuMode(null)
  supabase.from('kata').update({ last_reviewed_at: new Date().toISOString() }).eq('id', id) // gak perlu nunggu (fire-and-forget), biar flip-nya tetep instan
}

async function toggleHafal(k) {
  await supabase.from('kata').update({ hafal: !k.hafal, last_reviewed_at: new Date().toISOString() }).eq('id', k.id)
  muatSemua()
}

  async function cekDuplikat(jpText) {
    const norm = normalisasiJP(jpText)
    if (!norm) return null
    const { data } = await supabase.from('kata').select('jp, paket:paket_id (nama, tanggal)')
    if (!data) return null
    const match = data.find(row => normalisasiJP(row.jp) === norm)
    if (!match) return null
    return { nama: match.paket?.nama, tanggal: match.paket?.tanggal }
  }

  async function simpanKata() {
    if (!jp.trim() || !arti.trim()) { alert('Isi kata JP dan artinya dulu ya!'); return }
    const ketemu = await cekDuplikat(jp)
    if (ketemu) { setDup(ketemu); return }
    const { error } = await supabase.from('kata').insert({
      paket_id: paketId, jp: jp.trim(), arti: arti.trim(), bagian: bagianInput || '',
    })
    if (error) { alert('Gagal simpan: ' + error.message); return }
    setJp(''); setArti('')
    muatSemua()
  }

  async function tambahBagian() {
    const nama = prompt('Nama bagian baru (contoh: Episode 1, 20 menit awal):')
    if (!nama || !nama.trim()) return
    const next = [...bagianList, nama.trim()]
    await supabase.from('paket').update({ bagian_list: next }).eq('id', paketId)
    muatSemua()
  }

  async function editKata(k) {
    const jpBaru = prompt('Edit kata JP:', k.jp)
    if (jpBaru === null) return
    const artiBaru = prompt('Edit arti ID:', k.arti)
    if (artiBaru === null) return
    if (!jpBaru.trim() || !artiBaru.trim()) { alert('Nggak boleh kosong ya!'); return }
    await supabase.from('kata').update({ jp: jpBaru.trim(), arti: artiBaru.trim() }).eq('id', k.id)
    muatSemua()
  }

  async function hapusKata(k) {
    if (!confirm(`Hapus "${k.jp}"?`)) return
    await supabase.from('kata').delete().eq('id', k.id)
    muatSemua()
  }

  async function resetHafalan() {
    if (!confirm('Yakin mau reset semua hafalan di paket ini? Semua kata bakal balik jadi belum hafal.')) return
    await supabase.from('kata').update({ hafal: false }).eq('paket_id', paketId)
    muatSemua()
  }

  function klikKartu(k) {
    if (hapusMode) hapusKata(k)
    else if (editMode) editKata(k)
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
    setEditMode(e => { const next = !e; if (next) setHapusMode(false); return next })
  }
  function toggleHapusMode() {
    setHapusMode(h => { const next = !h; if (next) setEditMode(false); return next })
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
          <div className="card-front">{k.jp}</div>
          <div className="card-back">{k.arti}</div>
        </div>
        <button className="hafal-toggle" onClick={(e) => { e.stopPropagation(); toggleHafal(k) }}>✓</button>
      </div>
    )
  }

  async function bukaPdf() {
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
    if (!confirm('Hapus PDF dari paket ini?')) return
    if (paket.pdf_path) await supabase.storage.from('immersion-pdfs').remove([paket.pdf_path])
    await supabase.from('paket').update({ pdf_path: null }).eq('id', paketId)
    setShowPdf(false)
    muatSemua()
  }

  function startTes(dir) {
    const sumber = (filterBagian !== 'all' ? kataList.filter(k => k.bagian === filterBagian) : kataList)
      .filter(k => !k.hafal)
    if (sumber.length === 0) { alert('Semua kata di sini udah hafal, atau belum ada kata! 🎉'); return }
    const words = shuffle(sumber)
    setTes({ dir, words, idx: 0, correct: 0, wrong: 0, benarIds: [], answered: false, input: '', salah: false })
  }
  function tesCek() {
    if (!tes || tes.answered) return
    const w = tes.words[tes.idx]
    const val = tes.input.trim()
    if (!val) return
    let benar = false
    if (tes.dir === 'id-jp') benar = val === w.jp
    else benar = w.arti.split(/[/;]/).map(normalisasiID).some(p => p === normalisasiID(val))
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
      await Promise.all(tes.benarIds.map(id => supabase.from('kata').update({ hafal: true, last_reviewed_at: new Date().toISOString() }).eq('id', id)))
      muatSemua()
    }
    setTes(t => ({ ...t, idx: t.idx + 1 }))
  } else {
    setTes(t => ({ ...t, idx: t.idx + 1, answered: false, input: '', salah: false }))
  }
}
  function tutupTes() { setTes(null) }

  if (!paket) return <div style={{ padding: 40, textAlign: 'center', color: '#9abaa8' }}>Memuat...</div>

  const jumlahHafal = kataList.filter(k => k.hafal).length
  const selesai = tes && tes.idx >= tes.words.length

  return (
    <div>
      <div className="header-bar">
        <div className="title">{paket.nama}</div>
        {bagianList.length > 0 && (
          <>
            <button className={`act-btn ${filterBagian === 'all' ? 'active' : ''}`} onClick={() => setFilterBagian('all')}>Semua</button>
            {bagianList.map(b => (
              <button key={b} className={`act-btn ${filterBagian === b ? 'active' : ''}`} onClick={() => setFilterBagian(b)}>{b}</button>
            ))}
          </>
        )}
        <div className="stats">{kataList.length} kata · ✓ {jumlahHafal} hafal</div>
        <button className="icon-btn" onClick={() => goTo('paket')} title="Kembali">←</button>
      </div>

      <div className="actions">
        <button className={`act-btn ${kartuMode === 'buka' ? 'active' : ''}`} onClick={() => setKartu('buka')}>Buka semua ▾</button>
        <button className={`act-btn ${kartuMode === 'tutup' ? 'active' : ''}`} onClick={() => setKartu('tutup')}>Tutup semua ▴</button>
        <button className={`act-btn ${random ? 'active' : ''}`} onClick={toggleRandom}>🔀 Random</button>
        <button className={`act-btn ${sembunyikan ? 'active' : ''}`} onClick={toggleSembunyikan}>👁 Sembunyikan hafal</button>
        <button className={`act-btn ${tampilkanHafal ? 'active' : ''}`} onClick={toggleTampilkanHafal}>⭐ Hafal saja</button>
        <button className="act-btn" onClick={() => startTes('id-jp')}>📝 Tes ▾</button>
        <button className="act-btn" onClick={() => startTes('jp-id')}>📝 Tes ▴</button>
        <button className="act-btn" onClick={() => setShowForm(s => !s)}>＋ Kata</button>
        <button className={`act-btn ${paket.pdf_path ? 'active' : ''}`} onClick={bukaPdf} title={paket.pdf_path ? 'Lihat PDF' : 'Belum ada PDF'}>📄</button>
        <div style={{ position: 'relative', marginLeft: 'auto' }}>
          <button className="act-btn" onClick={() => setShowMenu(m => !m)} title="Menu lainnya">⋯</button>
          {showMenu && (
            <div style={{
              position: 'absolute', right: 0, top: 36, background: '#fff', border: '1.5px solid #ddd',
              borderRadius: 10, padding: 6, display: 'flex', flexDirection: 'column', gap: 4,
              boxShadow: '0 4px 16px rgba(0,0,0,.1)', zIndex: 20, minWidth: 160,
            }}>
              <button className="act-btn" style={{ textAlign: 'left' }} onClick={() => { tambahBagian(); setShowMenu(false) }}>＋ Bagian</button>
              <button className={`act-btn ${editMode ? 'active' : ''}`} style={{ textAlign: 'left' }} onClick={() => { toggleEditMode(); setShowMenu(false) }}>✏️ Mode Edit</button>
              <button className={`act-btn ${hapusMode ? 'active' : ''}`} style={{ textAlign: 'left' }} onClick={() => { toggleHapusMode(); setShowMenu(false) }}>🗑️ Mode Hapus</button>
              <button className="act-btn" style={{ textAlign: 'left', color: '#c0392b' }} onClick={() => { resetHafalan(); setShowMenu(false) }}>↺ Reset Hafalan</button>
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <div style={{ background: '#f0f7f0', borderRadius: 10, padding: 14, margin: '0 10px 10px', border: '1.5px solid #b8d8b8' }}>
          {bagianList.length > 0 && (
            <select value={bagianInput} onChange={e => setBagianInput(e.target.value)}
              style={{ width: '100%', padding: 7, borderRadius: 8, border: '1.5px solid #b8d8b8', marginBottom: 8, fontSize: 12 }}>
              <option value="">— Semua (tanpa bagian) —</option>
              {bagianList.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          )}
<div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
  <input placeholder="Kata JP (kanji/kana)" value={jp} onChange={e => setJp(e.target.value)}
    style={{ flex: 1.2, padding: 8, borderRadius: 8, border: '1.5px solid #b8d8b8', fontFamily: "'Noto Serif JP', serif" }} />
  <input placeholder="Arti ID" value={arti} onChange={e => setArti(e.target.value)}
    onKeyDown={e => e.key === 'Enter' && simpanKata()}
    style={{ flex: 1, padding: 8, borderRadius: 8, border: '1.5px solid #b8d8b8' }} />
  <button className="act-btn active" onClick={simpanKata} style={{ whiteSpace: 'nowrap' }}>Simpan</button>
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
        <div className="pdf-panel">
          <div className="pdf-panel-header">
            <div style={{ flex: 1, fontWeight: 700, color: '#2d6a4a', fontSize: 13 }}>📄 {paket.nama}</div>
            {paket.pdf_path && <button className="icon-btn danger" onClick={hapusPdf} title="Hapus PDF">🗑️</button>}
            <button className="icon-btn" onClick={() => setShowPdf(false)}>✕</button>
          </div>
          <div className="pdf-panel-body">
            {paket.pdf_path && pdfUrl ? (
              <iframe src={pdfUrl} style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }} />
            ) : (
              <div style={{ textAlign: 'center', color: '#cde8d0', padding: 30 }}>
                <div style={{ fontSize: 40, marginBottom: 14 }}>📎</div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Belum ada PDF di paket ini</div>
                <label style={{ display: 'inline-block', cursor: 'pointer', padding: '10px 20px', borderRadius: 10, background: '#2d6a4a', color: '#fff', fontSize: 13, fontWeight: 600 }}>
                  {uploading ? 'Uploading...' : '＋ Upload PDF'}
                  <input type="file" accept="application/pdf" onChange={uploadPdf} style={{ display: 'none' }} disabled={uploading} />
                </label>
              </div>
            )}
          </div>
        </div>
      )}

      {tes && (
        <div className="modal-overlay open">
          <div className="modal-box" style={{ maxWidth: 380 }}>
            {!selesai ? (
              <>
                <div style={{ fontSize: 11, color: '#9abaa8', marginBottom: 6 }}>{tes.idx + 1} / {tes.words.length} · ✓ {tes.correct} · ✗ {tes.wrong}</div>
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: '#9abaa8', marginBottom: 4 }}>
                  {tes.dir === 'id-jp' ? 'Tulis dalam huruf Jepang:' : 'Artinya dalam bahasa Indonesia:'}
                </div>
                <div style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 24, fontWeight: 600, marginBottom: 14, textAlign: 'center' }}>
                  {tes.dir === 'id-jp' ? tes.words[tes.idx].arti : tes.words[tes.idx].jp}
                </div>
                <input
                  autoFocus value={tes.input} disabled={tes.answered}
                  onChange={e => setTes(t => ({ ...t, input: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && (tes.answered ? tesLanjut() : tesCek())}
                  style={{ textAlign: 'center', fontSize: 18, fontFamily: tes.dir === 'id-jp' ? "'Noto Serif JP', serif" : 'inherit', borderColor: tes.answered ? (tes.salah ? '#c0392b' : '#1e7d4f') : undefined }}
                />
                {tes.answered && tes.salah && (
                  <div style={{ textAlign: 'center', fontSize: 12, color: '#888', marginBottom: 8 }}>
                    Jawaban: <b>{tes.dir === 'id-jp' ? tes.words[tes.idx].jp : tes.words[tes.idx].arti}</b>
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
