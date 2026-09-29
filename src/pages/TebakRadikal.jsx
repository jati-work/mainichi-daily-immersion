import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import RadicalPicker from '../components/RadicalPicker'
import { urutkanKategori, EMOJI_KATEGORI } from '../data/radikalData'

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

// Kartu radikal -- sengaja cuma nampilin karakter (depan) & arti (belakang).
// "menemonik" TIDAK dipajang di sini sama sekali, sama kayak "bunshuu" yang
// nggak dipajang di kartu kata; dia cuma ada di form isian.
function KartuRadikal({ r, isFlipped, editMode, hapusMode, onClick, onToggleHafal }) {
  return (
    <div className={`card ${isFlipped ? 'flipped' : ''} ${r.hafal ? 'hafal' : ''}`}>
      <div
        className="card-inner" onClick={onClick}
        style={{
          boxShadow: editMode ? '0 0 0 2px #7aaa8a' : hapusMode ? '0 0 0 2px #f0a8a0' : 'none',
          cursor: (editMode || hapusMode) ? 'pointer' : undefined,
        }}
      >
        <div className="card-front">
          <div style={{ fontFamily: "'Noto Serif JP', serif" }}>{r.karakter}</div>
        </div>
        <div className="card-back">
          <div>{r.arti}</div>
        </div>
      </div>
      <button className="hafal-toggle" onClick={(e) => { e.stopPropagation(); onToggleHafal(r) }}>✓</button>
    </div>
  )
}

export default function TebakRadikal({ goTo }) {
  const [radikalList, setRadikalList] = useState([])
  const [loading, setLoading] = useState(true)

  const [kategoriAktif, setKategoriAktif] = useState('all')
  const [flipped, setFlipped] = useState(new Set())
  const [kartuMode, setKartuMode] = useState(null)
  const [random, setRandom] = useState(false)
  const [randomOrder, setRandomOrder] = useState(new Map())
  const [sembunyikan, setSembunyikan] = useState(false)
  const [tampilkanHafal, setTampilkanHafal] = useState(false)

  const [editMode, setEditMode] = useState(false)
  const [hapusMode, setHapusMode] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [karakterInput, setKarakterInput] = useState('')
  const [artiInput, setArtiInput] = useState('')
  const [menemonikInput, setMenemonikInput] = useState('')
  const [kategoriInput, setKategoriInput] = useState('')
  const [kategoriBaruInput, setKategoriBaruInput] = useState('')

  const [showTesMenu, setShowTesMenu] = useState(false)
  const [tes, setTes] = useState(null)
  const [showPickerTes, setShowPickerTes] = useState(false)

  async function muatData() {
    setLoading(true)
    const { data } = await supabase.from('radikal').select('*').order('created_at')
    setRadikalList(data || [])
    setLoading(false)
  }
  useEffect(() => { muatData() }, [])

  useEffect(() => {
    function handleClickOutside(e) {
      if (!e.target.closest('[data-dropdown]')) setShowTesMenu(false)
      if (!e.target.closest('[data-form-area]') && !e.target.closest('.card') && !e.target.closest('.modal-overlay')) {
        batalForm()
        setEditMode(false)
        setHapusMode(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const kategoriTersedia = urutkanKategori([...new Set(radikalList.map(r => r.kategori))])

  const displayList = useMemo(() => {
    let list = radikalList
    if (kategoriAktif !== 'all') list = list.filter(r => r.kategori === kategoriAktif)
    if (sembunyikan) list = list.filter(r => !r.hafal)
    if (tampilkanHafal) list = list.filter(r => r.hafal)
    if (random) list = [...list].sort((a, b) => (randomOrder.get(a.id) ?? 0) - (randomOrder.get(b.id) ?? 0))
    return list
  }, [radikalList, kategoriAktif, sembunyikan, tampilkanHafal, random, randomOrder])

  function toggleFlip(id) {
    const next = new Set(flipped)
    if (next.has(id)) next.delete(id); else next.add(id)
    setFlipped(next)
    setKartuMode(null)
  }
  function setKartu(mode) {
    setKartuMode(mode)
    setFlipped(mode === 'buka' ? new Set(displayList.map(r => r.id)) : new Set())
  }
  function toggleRandom() {
    if (!random) {
      const map = new Map()
      shuffle(radikalList).forEach((r, i) => map.set(r.id, i))
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
  async function toggleHafal(r) {
    await supabase.from('radikal').update({ hafal: !r.hafal }).eq('id', r.id)
    muatData()
  }

  function tutupPanelLain() {
    batalForm()
    setEditMode(false)
    setHapusMode(false)
    setTes(null)
  }
  function toggleEditMode() {
    setEditMode(e => { const next = !e; if (next) { setHapusMode(false); batalForm() } return next })
  }
  function toggleHapusMode() {
    setHapusMode(h => { const next = !h; if (next) { setEditMode(false); batalForm() } return next })
  }

  function batalForm() {
    setKarakterInput(''); setArtiInput(''); setMenemonikInput(''); setKategoriInput(''); setKategoriBaruInput('')
    setEditingId(null)
    setShowForm(false)
  }
  function toggleForm() {
    if (showForm) { batalForm(); return }
    tutupPanelLain()
    setKategoriInput(kategoriAktif !== 'all' ? kategoriAktif : (kategoriTersedia[0] || '__baru__'))
    setShowForm(true)
  }
  function mulaiEdit(r) {
    setEditingId(r.id)
    setKarakterInput(r.karakter)
    setArtiInput(r.arti)
    setMenemonikInput(r.menemonik || '')
    setKategoriInput(r.kategori)
    setShowForm(true)
  }
  async function simpanRadikal() {
    const kategoriFinal = kategoriInput === '__baru__' ? kategoriBaruInput.trim() : kategoriInput
    if (!karakterInput.trim() || !artiInput.trim() || !kategoriFinal) {
      alert('Isi karakter, arti, dan kategorinya dulu ya!'); return
    }
    const payload = {
      karakter: karakterInput.trim(), arti: artiInput.trim(),
      menemonik: menemonikInput.trim(), kategori: kategoriFinal,
    }
    const { error } = editingId
      ? await supabase.from('radikal').update(payload).eq('id', editingId)
      : await supabase.from('radikal').insert(payload)
    if (error) { alert('Gagal simpan: ' + error.message); return }
    batalForm()
    muatData()
  }
  async function hapusRadikal(r) {
    if (!confirm(`Hapus radikal "${r.karakter}" (${r.arti})?`)) return
    await supabase.from('radikal').delete().eq('id', r.id)
    muatData()
  }
  function klikKartu(r) {
    if (hapusMode) hapusRadikal(r)
    else if (editMode) mulaiEdit(r)
    else toggleFlip(r.id)
  }

  function startTes(dir) {
    const sumber = (kategoriAktif !== 'all' ? radikalList.filter(r => r.kategori === kategoriAktif) : radikalList)
      .filter(r => !r.hafal)
    if (sumber.length === 0) { alert('Tidak ada radikal yang sesuai buat mode tes ini!'); return }
    tutupPanelLain()
    const words = shuffle(sumber)
    setTes({ dir, words, idx: 0, correct: 0, wrong: 0, benarIds: [], answered: false, input: '', salah: false })
  }
  function tesCek() {
    if (!tes || tes.answered || !tes.input.trim()) return
    const w = tes.words[tes.idx]
    const val = tes.input.trim()
    const benar = tes.dir === 'radikal-arti'
      ? w.arti.split(/[/;]/).map(normalisasiID).some(p => p === normalisasiID(val))
      : val === w.karakter
    setTes(t => ({
      ...t, answered: true, salah: !benar,
      correct: t.correct + (benar ? 1 : 0), wrong: t.wrong + (benar ? 0 : 1),
      benarIds: benar ? [...t.benarIds, w.id] : t.benarIds,
    }))
  }
  async function tesLanjut() {
    if (tes.idx + 1 >= tes.words.length) {
      if (tes.benarIds.length > 0) {
        await Promise.all(tes.benarIds.map(id => supabase.from('radikal').update({ hafal: true }).eq('id', id)))
        muatData()
      }
      setTes(t => ({ ...t, idx: t.idx + 1 }))
    } else {
      setTes(t => ({ ...t, idx: t.idx + 1, answered: false, input: '', salah: false }))
    }
  }
  function tutupTes() { setTes(null); setShowPickerTes(false) }

  const kategoriUntukStats = kategoriAktif !== 'all' ? radikalList.filter(r => r.kategori === kategoriAktif) : radikalList
  const jumlahHafal = kategoriUntukStats.filter(r => r.hafal).length
  const selesai = tes && tes.idx >= tes.words.length
  const groupedView = kategoriAktif === 'all' && kategoriTersedia.length > 0

  return (
    <div>
      <style>{`
        .kategori-scroll::-webkit-scrollbar { height: 0; display: none; }
        .kategori-scroll { scrollbar-width: none; -ms-overflow-style: none; }
      `}</style>

      <div className="header-bar" style={{ flexWrap: 'nowrap', alignItems: 'center', gap: 10 }}>
        <div className="title" style={{ flexShrink: 0, marginTop: -2 }}>部首 Tebak Radikal</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: '1 1 auto' }}>
          <button className={`act-btn ${kategoriAktif === 'all' ? 'active' : ''}`} onClick={() => setKategoriAktif('all')} style={{ flexShrink: 0 }}>Semua</button>
          <div className="kategori-scroll" style={{ display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto', flexWrap: 'nowrap', minWidth: 0, padding: '3px 4px', margin: '0 -4px' }}>
            {kategoriTersedia.map(k => (
              <button key={k} className={`act-btn ${kategoriAktif === k ? 'active' : ''}`} onClick={() => setKategoriAktif(k)} style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
                {EMOJI_KATEGORI[k] || '✨'} {k}
              </button>
            ))}
          </div>
        </div>
        <div className="stats" style={{ flexShrink: 0, marginLeft: 'auto', paddingLeft: 10 }}>{kategoriUntukStats.length} radikal · ✓ {jumlahHafal} hafal</div>
        <button className="icon-btn" onClick={() => goTo('cover')} title="Kembali" style={{ flexShrink: 0 }}>←</button>
      </div>

      <div className="actions">
        <button className={`act-btn ${kartuMode === 'buka' ? 'active' : ''}`} onClick={() => setKartu('buka')}>Buka semua ▾</button>
        <button className={`act-btn ${kartuMode === 'tutup' ? 'active' : ''}`} onClick={() => setKartu('tutup')}>Tutup semua ▴</button>
        <button className={`act-btn ${random ? 'active' : ''}`} onClick={toggleRandom}>🔀 Random</button>
        <button className={`act-btn ${sembunyikan ? 'active' : ''}`} onClick={toggleSembunyikan}>👁 Sembunyikan hafal</button>
        <button className={`act-btn ${tampilkanHafal ? 'active' : ''}`} onClick={toggleTampilkanHafal}>⭐ Hafal saja</button>
        <div style={{ position: 'relative' }} data-dropdown>
          <button className="act-btn" onClick={() => setShowTesMenu(s => !s)}>📝 Tes</button>
          {showTesMenu && (
            <div style={{ position: 'absolute', left: 0, top: 36, background: '#fff', border: '1.5px solid #ddd', borderRadius: 10, padding: 6, display: 'flex', flexDirection: 'column', gap: 4, boxShadow: '0 4px 16px rgba(0,0,0,.1)', zIndex: 20, minWidth: 200 }}>
              <div style={{ fontSize: 10, color: '#9abaa8', padding: '2px 6px', letterSpacing: '.06em', textTransform: 'uppercase' }}>Soal → Jawaban</div>
              <button className="act-btn" style={{ textAlign: 'left' }} onClick={() => { startTes('radikal-arti'); setShowTesMenu(false) }}>Radikal → Arti</button>
              <button className="act-btn" style={{ textAlign: 'left' }} onClick={() => { startTes('arti-radikal'); setShowTesMenu(false) }}>Arti → Radikal</button>
            </div>
          )}
        </div>
        <button className={`act-btn ${showForm && !editingId ? 'active' : ''}`} onClick={toggleForm}>{editingId ? '✏️ Edit Radikal' : '＋ Radikal'}</button>
        <button className={`act-btn ${editMode ? 'active' : ''}`} onClick={toggleEditMode}>✏️ Edit</button>
        <button className={`act-btn ${hapusMode ? 'active' : ''}`} onClick={toggleHapusMode}>🗑️ Hapus</button>
      </div>

      {showForm && (
        <div data-form-area style={{ background: '#f0f7f0', borderRadius: 10, padding: 14, margin: '0 10px 10px', border: '1.5px solid #b8d8b8' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#2d6a4a', marginBottom: 8, letterSpacing: '.04em', textTransform: 'uppercase' }}>
            {editingId ? '✏️ Edit Radikal' : '＋ Tambah Radikal'}
          </div>
          <select value={kategoriInput} onChange={e => setKategoriInput(e.target.value)}
            style={{ width: '100%', padding: 7, borderRadius: 8, border: '1.5px solid #b8d8b8', marginBottom: 8, fontSize: 12 }}>
            {kategoriTersedia.length === 0 && <option value="">— Pilih kategori —</option>}
            {kategoriTersedia.map(k => <option key={k} value={k}>{EMOJI_KATEGORI[k] || '✨'} {k}</option>)}
            <option value="__baru__">➕ Kategori baru...</option>
          </select>
          {kategoriInput === '__baru__' && (
            <input placeholder="Nama kategori baru" value={kategoriBaruInput} onChange={e => setKategoriBaruInput(e.target.value)}
              style={{ width: '100%', padding: 8, borderRadius: 8, border: '1.5px solid #b8d8b8', marginBottom: 8, fontSize: 13, boxSizing: 'border-box' }} />
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <input placeholder="Karakter" value={karakterInput} onChange={e => setKarakterInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && simpanRadikal()}
              style={{ padding: 8, borderRadius: 8, border: '1.5px solid #b8d8b8', fontFamily: "'Noto Serif JP', serif" }} />
            <input placeholder="Arti" value={artiInput} onChange={e => setArtiInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && simpanRadikal()}
              style={{ padding: 8, borderRadius: 8, border: '1.5px solid #b8d8b8' }} />
            <input placeholder="Menemonik / catatan bantu-inget (opsional)" value={menemonikInput} onChange={e => setMenemonikInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && simpanRadikal()}
              style={{ padding: 8, borderRadius: 8, border: '1.5px solid #b8d8b8', gridColumn: '1 / -1' }} />
            <div style={{ gridColumn: '1 / -1' }}>
              <button className="act-btn active" onClick={simpanRadikal} style={{ width: '100%', padding: 10, fontWeight: 600 }}>
                {editingId ? 'Update' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid-wrap">
        {loading && <div style={{ textAlign: 'center', color: '#9abaa8', padding: 40, fontSize: 13 }}>Memuat...</div>}

        {!loading && !groupedView && (
          <div className="card-grid">
            {displayList.map(r => (
              <KartuRadikal key={r.id} r={r} isFlipped={flipped.has(r.id)} editMode={editMode} hapusMode={hapusMode} onClick={() => klikKartu(r)} onToggleHafal={toggleHafal} />
            ))}
          </div>
        )}

        {!loading && groupedView && kategoriTersedia.map(k => {
          const items = displayList.filter(r => r.kategori === k)
          if (items.length === 0) return null
          return (
            <div key={k} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#7aaa8a', padding: '8px 4px 4px' }}>
                {EMOJI_KATEGORI[k] || '✨'} {k}
              </div>
              <div className="card-grid">
                {items.map(r => (
                  <KartuRadikal key={r.id} r={r} isFlipped={flipped.has(r.id)} editMode={editMode} hapusMode={hapusMode} onClick={() => klikKartu(r)} onToggleHafal={toggleHafal} />
                ))}
              </div>
            </div>
          )
        })}

        {!loading && displayList.length === 0 && (
          <div style={{ textAlign: 'center', color: '#9abaa8', padding: 40, fontSize: 13 }}>
            {radikalList.length === 0 ? 'Belum ada radikal. Klik "＋ Radikal" buat mulai nambahin.' : 'Nggak ada radikal di filter ini.'}
          </div>
        )}
      </div>

      {tes && (
        <div className="modal-overlay open">
          <div className="modal-box" style={{ maxWidth: 380 }}>
            {tes.dir === 'arti-radikal' && !selesai && (
              <RadicalPicker
                variant="panel"
                open={showPickerTes}
                onToggle={() => setShowPickerTes(s => !s)}
                onClose={() => setShowPickerTes(false)}
                onPilih={(k) => { setTes(t => ({ ...t, input: k })); setShowPickerTes(false) }}
              />
            )}
            {!selesai ? (
              <>
                <div style={{ fontSize: 11, color: '#9abaa8', marginBottom: 6 }}>{tes.idx + 1} / {tes.words.length} · ✓ {tes.correct} · ✗ {tes.wrong}</div>
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: '#9abaa8', marginBottom: 4 }}>
                  {tes.dir === 'radikal-arti' ? 'Tulis Artinya:' : 'Pilih Radikalnya (tab 部首 di kanan):'}
                </div>
                <div style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 24, fontWeight: 600, marginBottom: 14, textAlign: 'center' }}>
                  {tes.dir === 'radikal-arti' ? tes.words[tes.idx].karakter : tes.words[tes.idx].arti}
                </div>
                {tes.dir === 'radikal-arti' ? (
                  <input
                    autoFocus value={tes.input} disabled={tes.answered}
                    onChange={e => setTes(t => ({ ...t, input: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && (tes.answered ? tesLanjut() : tesCek())}
                    style={{
                      textAlign: 'center', fontSize: 18,
                      borderColor: tes.answered ? (tes.salah ? '#c0392b' : '#1e7d4f') : undefined,
                    }}
                  />
                ) : (
                  <div
                    onClick={() => !tes.answered && setShowPickerTes(true)}
                    style={{
                      textAlign: 'center', fontSize: 28, fontFamily: "'Noto Serif JP', serif", padding: '14px 0',
                      border: '1.5px solid #b8d8b8', borderRadius: 10, marginBottom: 4, boxSizing: 'border-box',
                      cursor: tes.answered ? 'default' : 'pointer', color: tes.input ? '#222' : '#b8c8b8',
                      borderColor: tes.answered ? (tes.salah ? '#c0392b' : '#1e7d4f') : '#b8d8b8',
                    }}
                  >
                    {tes.input || 'klik di sini / buka tab 部首'}
                  </div>
                )}
                {tes.answered && tes.salah && (
                  <div style={{ textAlign: 'center', fontSize: 12, color: '#888', marginBottom: 8, marginTop: 6 }}>
                    Jawaban: <b style={{ fontFamily: "'Noto Serif JP', serif" }}>
                      {tes.dir === 'radikal-arti' ? tes.words[tes.idx].arti : tes.words[tes.idx].karakter}
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
                  {tes.benarIds.length > 0 ? `${tes.benarIds.length} radikal otomatis diceklis hafal ✓` : 'Belum ada yang benar, coba lagi!'}
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
