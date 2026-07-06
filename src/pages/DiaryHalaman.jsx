import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'

const WARNA_HIGHLIGHT = ['#fff176', '#a5d6a7', '#f48fb1', '#90caf9']
const WARNA_TEKS = ['#2d6a4a', '#c0392b', '#1565c0', '#8e44ad', '#000000']

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

function IconEraser({ color = '#c0392b', size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.5 13.5 10.8 3.8a2 2 0 0 0-2.8 0L3.8 8a2 2 0 0 0 0 2.8l9.7 9.7" />
      <path d="M8 20.5H21" />
      <path d="m6 14 6 6" />
    </svg>
  )
}

function IconLock({ open, color = '#1a1a1a', size = 16 }) {
  return open ? (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 7.6-1.8" />
    </svg>
  ) : (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}

function CatatanTeks({ data, autoFocus, onSimpan, onHapus, hapusMode, onPindah }) {
  const [text, setText] = useState(data.text || '')
  const [editing, setEditing] = useState(autoFocus || !data.text)
  const ref = useRef(null)

  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  function selesai() {
    setEditing(false)
    if (text.trim()) onSimpan(data.id, text)
    else onHapus(data.id)
  }

  function handleClick() {
    if (hapusMode) { onHapus(data.id); return }
    if (!editing) setEditing(true)
  }

  function handleDragMouseDown(e) {
    e.stopPropagation()
    onPindah(data.id, e)
  }

  return (
    <div
      onMouseDown={e => e.stopPropagation()}
      onClick={handleClick}
      style={{
        position: 'absolute', left: data.x * 100 + '%', top: data.y * 100 + '%', minWidth: 60,
        outline: hapusMode ? '2px dashed #c0392b' : editing ? '1.5px dashed #2d6a4a' : 'none',
        outlineOffset: 3, borderRadius: 4,
        cursor: hapusMode ? 'pointer' : 'default',
      }}
    >
      {editing && !hapusMode && (
        <div
          onMouseDown={handleDragMouseDown}
          title="Geser catatan"
          style={{
            position: 'absolute', left: -18, top: 2, width: 16, height: 24,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'grab', color: '#2d6a4a', fontSize: 13, lineHeight: 1,
            userSelect: 'none', background: 'rgba(255,255,255,.9)', borderRadius: 3,
            border: '1px solid rgba(45,106,74,.4)',
          }}
        >⠿</div>
      )}
      {editing && !hapusMode ? (
        <textarea
          ref={ref}
          value={text}
          onChange={e => setText(e.target.value)}
          onBlur={selesai}
          rows={Math.max(1, text.split('\n').length)}
          placeholder="Tulis catatan..."
          style={{
            display: 'block', resize: 'both', minWidth: 120, minHeight: 30,
            fontSize: 13, padding: '5px 7px', border: '1.5px dashed #2d6a4a',
            borderRadius: 6, background: 'rgba(255,255,255,.95)', color: data.color || '#2d6a4a',
            fontFamily: "'Noto Serif JP', serif", fontWeight: 400,
          }}
        />
      ) : (
        <div
          style={{
            fontSize: 13, fontWeight: 400, color: data.color || '#2d6a4a', cursor: hapusMode ? 'pointer' : 'text',
            whiteSpace: 'pre-wrap', fontFamily: "'Noto Serif JP', serif", padding: '2px 4px',
          }}
        >
          {data.text}
        </div>
      )}
    </div>
  )
}

function HighlightBox({ data, onHapus, hapusMode }) {
  return (
    <div
      onMouseDown={e => e.stopPropagation()}
      onClick={() => { if (hapusMode) onHapus(data.id) }}
      style={{
        position: 'absolute',
        left: data.x * 100 + '%', top: data.y * 100 + '%',
        width: data.width * 100 + '%', height: data.height * 100 + '%',
        background: data.color, opacity: 0.4, mixBlendMode: 'multiply',
        outline: hapusMode ? '2px dashed #c0392b' : 'none', outlineOffset: 2,
        cursor: hapusMode ? 'pointer' : 'default',
      }}
    />
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
  const [showKonfirmasiBuka, setShowKonfirmasiBuka] = useState(false)

  const [anotasi, setAnotasi] = useState([])
  const [mode, setMode] = useState(null) // null | 'highlight' | 'text' | 'hapus'
  const [warnaHighlight, setWarnaHighlight] = useState(WARNA_HIGHLIGHT[0])
  const [warnaTeks, setWarnaTeks] = useState(WARNA_TEKS[0])
  const [drawing, setDrawing] = useState(null)
  const [editingTeksId, setEditingTeksId] = useState(null)
  const [draggingId, setDraggingId] = useState(null)
  const [dragOffset, setDragOffset] = useState({ dx: 0, dy: 0 })

  const debounceRef = useRef(null)
  const overlayRef = useRef(null)
  const halamanAktif = halaman[indexAktif] || null
  const terkunci = !!halamanAktif?.terkunci

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

  useEffect(() => {
    setTeks(halamanAktif?.isi_teks || '')
    setMode(null)
    if (halamanAktif) muatAnotasi(halamanAktif.id)
    else setAnotasi([])
  }, [indexAktif, halaman.length])

  async function muatAnotasi(diaryPageId) {
    const { data } = await supabase
      .from('diary_highlights')
      .select('*')
      .eq('diary_page_id', diaryPageId)
    setAnotasi(data || [])
  }

  // ----- autosave teks -----
  function handleChangeTeks(val) {
    setTeks(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { simpanTeks(val) }, 1500)
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

  // ----- kunci / buka kunci halaman -----
  async function kunciHalaman() {
    paksaSimpan()
    const { error } = await supabase.from('diary_pages').update({ terkunci: true }).eq('id', halamanAktif.id)
    if (error) { alert('Gagal mengunci halaman: ' + error.message); return }
    setHalaman(list => list.map((h, i) => (i === indexAktif ? { ...h, terkunci: true } : h)))
    setMode(null)
  }
  function mintaBukaKunci() { setShowKonfirmasiBuka(true) }
  async function bukaKunci() {
    const { error } = await supabase.from('diary_pages').update({ terkunci: false }).eq('id', halamanAktif.id)
    setShowKonfirmasiBuka(false)
    if (error) { alert('Gagal membuka kunci: ' + error.message); return }
    setHalaman(list => list.map((h, i) => (i === indexAktif ? { ...h, terkunci: false } : h)))
    setMode(null)
  }

  // ----- posisi mouse relatif ke area teks (0..1) -----
  function posisiRelatif(e) {
    const rect = overlayRef.current.getBoundingClientRect()
    return {
      x: Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1),
      y: Math.min(Math.max((e.clientY - rect.top) / rect.height, 0), 1),
    }
  }

  function handleOverlayMouseDown(e) {
    if (mode === 'highlight') {
      const { x, y } = posisiRelatif(e)
      setDrawing({ startX: x, startY: y, x, y, width: 0, height: 0 })
    } else if (mode === 'text' && e.target === overlayRef.current) {
      const { x, y } = posisiRelatif(e)
      tambahCatatan(x, y)
    }
  }
  function handleOverlayMouseMove(e) {
    if (draggingId) {
      const pos = posisiRelatif(e)
      const nx = Math.min(Math.max(pos.x - dragOffset.dx, 0), 1)
      const ny = Math.min(Math.max(pos.y - dragOffset.dy, 0), 1)
      setAnotasi(a => a.map(item => (item.id === draggingId ? { ...item, x: nx, y: ny } : item)))
      return
    }
    if (!drawing) return
    const { x: curX, y: curY } = posisiRelatif(e)
    setDrawing(d => ({
      ...d,
      x: Math.min(d.startX, curX),
      y: Math.min(d.startY, curY),
      width: Math.abs(curX - d.startX),
      height: Math.abs(curY - d.startY),
    }))
  }
  async function handleOverlayMouseUp() {
    if (draggingId) { await selesaiDrag(); return }
    if (!drawing) return
    const { x, y, width, height } = drawing
    setDrawing(null)
    if (width < 0.004 || height < 0.004) return
    const baru = { diary_page_id: halamanAktif.id, x, y, width, height, color: warnaHighlight, type: 'highlight' }
    const { data, error } = await supabase.from('diary_highlights').insert(baru).select().single()
    if (error) { alert('Gagal simpan highlight: ' + error.message); return }
    setAnotasi(a => [...a, data])
  }

  async function tambahCatatan(x, y) {
    const baru = { diary_page_id: halamanAktif.id, x, y, width: 0.25, height: 0, color: warnaTeks, type: 'text', text: '' }
    const { data, error } = await supabase.from('diary_highlights').insert(baru).select().single()
    if (error) { alert('Gagal bikin catatan: ' + error.message); return }
    setAnotasi(a => [...a, data])
    setEditingTeksId(data.id)
  }
  async function simpanTeksCatatan(id, text) {
    await supabase.from('diary_highlights').update({ text }).eq('id', id)
    setAnotasi(a => a.map(x => (x.id === id ? { ...x, text } : x)))
  }
  async function hapusAnotasi(id) {
    await supabase.from('diary_highlights').delete().eq('id', id)
    setAnotasi(a => a.filter(x => x.id !== id))
  }

  function mulaiDrag(id, e) {
    const item = anotasi.find(a => a.id === id)
    if (!item) return
    const pos = posisiRelatif(e)
    setDragOffset({ dx: pos.x - item.x, dy: pos.y - item.y })
    setDraggingId(id)
  }
  async function selesaiDrag() {
    if (!draggingId) return
    const id = draggingId
    const item = anotasi.find(a => a.id === id)
    setDraggingId(null)
    if (item) await supabase.from('diary_highlights').update({ x: item.x, y: item.y }).eq('id', id)
  }

  const highlightList = anotasi.filter(a => a.type !== 'text')
  const teksList = anotasi.filter(a => a.type === 'text')

  return (
    <div className="pdf-panel">
      <div className="pdf-panel-header" style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button
            className="icon-btn"
            onClick={tambahHalaman}
            title="Tambah halaman baru"
            style={{ background: '#fff', border: '1.5px solid #2d6a4a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          ><IconPlus color="#2d6a4a" size={16} /></button>
          <span style={{ fontSize: 11, color: '#1a1a1a', opacity: 0.6, minWidth: 80 }}>
            {terkunci ? 'Terkunci' : (saving ? 'Menyimpan...' : 'Tersimpan')}
          </span>

          {terkunci && (
            <>
              <button
                className="icon-btn"
                onClick={() => setMode(m => (m === 'highlight' ? null : 'highlight'))}
                title="Highlight"
                style={{ background: mode === 'highlight' ? '#2d6a4a' : '#fff', color: mode === 'highlight' ? '#2d6a4a' : '#fff', border: '1.5px solid #2d6a4a' }}
              >🖍️</button>
              <button
                className="icon-btn"
                onClick={() => setMode(m => (m === 'text' ? null : 'text'))}
                title="Catatan teks"
                style={{
                  background: mode === 'text' ? '#2d6a4a' : '#fff',
                  color: mode === 'text' ? '#fff' : '#2d6a4a',
                  border: '1.5px solid #2d6a4a',
                  fontWeight: 700, fontStyle: 'italic', fontFamily: 'Georgia, serif', fontSize: 13,
                }}
              >abc</button>
              <button
                className="icon-btn"
                onClick={() => setMode(m => (m === 'hapus' ? null : 'hapus'))}
                title="Mode hapus anotasi"
                style={{
                  background: mode === 'hapus' ? '#c0392b' : '#fff',
                  border: '1.5px solid #c0392b',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              ><IconEraser color={mode === 'hapus' ? '#fff' : '#c0392b'} size={16} /></button>

              {mode === 'highlight' && WARNA_HIGHLIGHT.map(w => (
                <button
                  key={w}
                  onClick={() => setWarnaHighlight(w)}
                  title={w}
                  style={{
                    width: 20, height: 20, borderRadius: '50%', background: w, cursor: 'pointer',
                    border: warnaHighlight === w ? '2px solid #1a1a1a' : '1px solid rgba(0,0,0,.2)',
                  }}
                />
              ))}
              {mode === 'text' && WARNA_TEKS.map(w => (
                <button
                  key={w}
                  onClick={() => setWarnaTeks(w)}
                  title={w}
                  style={{
                    width: 20, height: 20, borderRadius: '50%', background: w, cursor: 'pointer',
                    border: warnaTeks === w ? '2px solid #1a1a1a' : '1px solid rgba(0,0,0,.2)',
                  }}
                />
              ))}
            </>
          )}
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
            className="icon-btn"
            onClick={() => (terkunci ? mintaBukaKunci() : kunciHalaman())}
            title={terkunci ? 'Buka kunci (edit lagi)' : 'Kunci halaman ini'}
            disabled={!halamanAktif}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          ><IconLock open={!terkunci} size={16} /></button>
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

      <div className="pdf-panel-body" style={{ overflow: 'auto', overflowY: 'scroll', scrollbarGutter: 'stable', display: 'block', textAlign: 'center', padding: 20 }}>
        {loading ? (
          <div style={{ color: '#cde8d0', padding: 30 }}>Memuat diary...</div>
        ) : terkunci ? (
          <div style={{ width: 820, margin: '0 auto', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{
              position: 'relative', flex: 1, background: '#fff', padding: '36px 44px', fontSize: 17,
              lineHeight: 1.9, color: '#1f2d24', fontFamily: "'Noto Serif JP', serif", whiteSpace: 'pre-wrap',
              boxShadow: '0 0 0 1px rgba(0,0,0,.05)', borderRadius: 4, boxSizing: 'border-box', textAlign: 'left',
            }}>
              {teks || <span style={{ opacity: 0.4 }}>(halaman ini kosong)</span>}
              <div
                ref={overlayRef}
                onMouseDown={handleOverlayMouseDown}
                onMouseMove={handleOverlayMouseMove}
                onMouseUp={handleOverlayMouseUp}
                onMouseLeave={() => { setDrawing(null); selesaiDrag() }}
                style={{
                  position: 'absolute', inset: 0,
                  cursor: mode === 'highlight' ? 'crosshair' : mode === 'text' ? 'text' : 'default',
                }}
              >
                {highlightList.map(h => (
                  <HighlightBox key={h.id} data={h} onHapus={hapusAnotasi} hapusMode={mode === 'hapus'} />
                ))}
                {teksList.map(t => (
                  <CatatanTeks
                    key={t.id}
                    data={t}
                    autoFocus={t.id === editingTeksId}
                    onSimpan={simpanTeksCatatan}
                    onHapus={hapusAnotasi}
                    hapusMode={mode === 'hapus'}
                    onPindah={mulaiDrag}
                  />
                ))}
                {drawing && (
                  <div style={{
                    position: 'absolute',
                    left: drawing.x * 100 + '%', top: drawing.y * 100 + '%',
                    width: drawing.width * 100 + '%', height: drawing.height * 100 + '%',
                    background: warnaHighlight, opacity: 0.4, mixBlendMode: 'multiply',
                    pointerEvents: 'none',
                  }} />
                )}
              </div>
            </div>
          </div>
        ) : (
          <textarea
            value={teks}
            onChange={e => handleChangeTeks(e.target.value)}
            placeholder="Tulis apa saja di sini..."
            style={{
              width: 820, minHeight: '100%', resize: 'none', border: 'none', outline: 'none',
              background: '#fff', padding: '36px 44px', fontSize: 17, lineHeight: 1.9, color: '#1f2d24',
              fontFamily: "'Noto Serif JP', serif", boxShadow: '0 0 0 1px rgba(0,0,0,.05)', borderRadius: 4,
            }}
          />
        )}
      </div>

      {showKonfirmasiHapus && (
        <div
          onClick={() => setShowKonfirmasiHapus(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 10, padding: '22px 24px', width: '90%', maxWidth: 340, boxShadow: '0 10px 30px rgba(0,0,0,.25)', textAlign: 'center' }}>
            <div style={{ fontSize: 30, marginBottom: 8 }}>🗑️</div>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#1f2d24', marginBottom: 6 }}>Hapus halaman ini?</div>
            <div style={{ fontSize: 13, color: '#5b6b60', marginBottom: 18, lineHeight: 1.5 }}>
              Isi tulisan dan semua highlight/catatan di halaman ini akan hilang permanen.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => setShowKonfirmasiHapus(false)} style={{ padding: '8px 18px', borderRadius: 6, border: '1px solid #d6ded9', background: '#fff', color: '#3a4a40', fontSize: 13, cursor: 'pointer' }}>Batal</button>
              <button onClick={hapusHalamanAktif} style={{ padding: '8px 18px', borderRadius: 6, border: 'none', background: '#c0392b', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Ya, Hapus</button>
            </div>
          </div>
        </div>
      )}

      {showKonfirmasiBuka && (
        <div
          onClick={() => setShowKonfirmasiBuka(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 10, padding: '22px 24px', width: '90%', maxWidth: 360, boxShadow: '0 10px 30px rgba(0,0,0,.25)', textAlign: 'center' }}>
            <div style={{ fontSize: 30, marginBottom: 8 }}>🔓</div>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#1f2d24', marginBottom: 6 }}>Buka kunci halaman ini?</div>
            <div style={{ fontSize: 13, color: '#5b6b60', marginBottom: 18, lineHeight: 1.5 }}>
              Kalau kamu edit tulisan di atas highlight/catatan yang udah ada, posisinya bisa meleset dari kata yang dimaksud.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => setShowKonfirmasiBuka(false)} style={{ padding: '8px 18px', borderRadius: 6, border: '1px solid #d6ded9', background: '#fff', color: '#3a4a40', fontSize: 13, cursor: 'pointer' }}>Batal</button>
              <button onClick={bukaKunci} style={{ padding: '8px 18px', borderRadius: 6, border: 'none', background: '#1565c0', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Ya, Buka Kunci</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
