import { useEffect, useMemo, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import jsPDF from 'jspdf'
import { supabase } from '../supabaseClient'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc

const WARNA_HIGHLIGHT = ['#fff176', '#a5d6a7', '#f48fb1', '#90caf9']
const WARNA_TEKS = ['#2d6a4a', '#c0392b', '#1565c0', '#8e44ad', '#000000']

function IconEraser({ color = '#c0392b', size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.5 13.5 10.8 3.8a2 2 0 0 0-2.8 0L3.8 8a2 2 0 0 0 0 2.8l9.7 9.7" />
      <path d="M8 20.5H21" />
      <path d="m6 14 6 6" />
    </svg>
  )
}

function IconDownload({ color = '#2d6a4a', size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  )
}

function CatatanTeks({ data, autoFocus, onSimpan, onHapus, hapusMode, onPindah }) {
  const [text, setText] = useState(data.text || '')
  const [editing, setEditing] = useState(autoFocus || !data.text)
  const ref = useRef(null)

  useEffect(() => {
    if (editing) ref.current?.focus()
  }, [editing])

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

function HighlightBox({ data, onHapus, hapusMode, modeUji, revealed, onToggleReveal }) {
  // Mode uji ("aka shiito"): highlight jadi solid nutup teks di baliknya sampai di-tap.
  // Teks/highlight lain yg gak kena tap gak kepengaruh.
  const tertutup = modeUji && !revealed
  return (
    <div
      onMouseDown={e => e.stopPropagation()}
      onClick={() => {
        if (hapusMode) { onHapus(data.id); return }
        if (modeUji) { onToggleReveal(data.id); return }
      }}
      title={modeUji ? (tertutup ? 'Tap untuk buka jawaban' : 'Tap untuk tutup lagi') : undefined}
      style={{
        position: 'absolute',
        left: data.x * 100 + '%', top: data.y * 100 + '%',
        width: data.width * 100 + '%', height: data.height * 100 + '%',
        background: data.color,
        opacity: tertutup ? 1 : 0.4,
        mixBlendMode: tertutup ? 'normal' : 'multiply',
        outline: hapusMode ? '2px dashed #c0392b' : 'none', outlineOffset: 2,
        cursor: hapusMode || modeUji ? 'pointer' : 'default',
        transition: 'opacity .15s ease',
      }}
    />
  )
}

// paketId, pdfPath, pdfUrl (signed url), onClose, onHapusPdf: props dari PaketDetail
export default function PdfHighlighter({ paketId, pdfPath, pdfUrl, onClose, onHapusPdf }) {
  const [pdfDoc, setPdfDoc] = useState(null)
  const [numPages, setNumPages] = useState(0)
  const [pageNum, setPageNum] = useState(1)
  const [scale, setScale] = useState(1.2)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState(null)
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 })

  const [anotasi, setAnotasi] = useState([])
  const [mode, setMode] = useState(null) // null | 'highlight' | 'text'
  const [modeUji, setModeUji] = useState(false) // mode "aka shiito": highlight ditutup solid buat uji hafalan
  const [revealedIds, setRevealedIds] = useState(() => new Set())
  const [warnaHighlight, setWarnaHighlight] = useState(WARNA_HIGHLIGHT[0])
  const [warnaTeks, setWarnaTeks] = useState(WARNA_TEKS[0])
  const [drawing, setDrawing] = useState(null)
  const [editingTeksId, setEditingTeksId] = useState(null)
  const [showKonfirmasiHapus, setShowKonfirmasiHapus] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [draggingId, setDraggingId] = useState(null)
  const [dragOffset, setDragOffset] = useState({ dx: 0, dy: 0 })

  const canvasRef = useRef(null)
  const overlayRef = useRef(null)

  // ----- load dokumen PDF -----
  useEffect(() => {
    let batal = false
    async function muat() {
      setLoading(true)
      setErrorMsg(null)
      try {
        const doc = await pdfjsLib.getDocument({ url: pdfUrl }).promise
        if (batal) return
        setPdfDoc(doc)
        setNumPages(doc.numPages)
        setPageNum(1)
        setLoading(false)
      } catch (err) {
        console.error('Gagal memuat PDF:', err)
        if (!batal) {
          setErrorMsg(err?.message || 'Gagal memuat PDF, cek console untuk detail.')
          setLoading(false)
        }
      }
    }
    muat()
    return () => { batal = true }
  }, [pdfUrl])

  // ----- render halaman ke canvas -----
  useEffect(() => {
    let batal = false
    async function render() {
      if (!pdfDoc) return
      const page = await pdfDoc.getPage(pageNum)
      const viewport = page.getViewport({ scale })
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')

      // render di resolusi native layar (HiDPI/retina) biar nggak burem,
      // tapi ukuran tampilan (CSS) tetap sesuai viewport
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.floor(viewport.width * dpr)
      canvas.height = Math.floor(viewport.height * dpr)
      canvas.style.width = `${viewport.width}px`
      canvas.style.height = `${viewport.height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      await page.render({ canvasContext: ctx, viewport }).promise
      if (!batal) setCanvasSize({ width: viewport.width, height: viewport.height })
    }
    render()
    return () => { batal = true }
  }, [pdfDoc, pageNum, scale])

  // ----- load anotasi (highlight + teks) dari Supabase -----
  async function muatAnotasi() {
    const { data } = await supabase
      .from('pdf_highlights')
      .select('*')
      .eq('paket_id', paketId)
      .eq('pdf_path', pdfPath)
    setAnotasi(data || [])
  }
  useEffect(() => { muatAnotasi() }, [paketId, pdfPath])

  const anotasiHalIni = useMemo(() => anotasi.filter(a => a.page === pageNum), [anotasi, pageNum])
  const highlightHalIni = useMemo(() => anotasiHalIni.filter(a => a.type !== 'text'), [anotasiHalIni])
  const teksHalIni = useMemo(() => anotasiHalIni.filter(a => a.type === 'text'), [anotasiHalIni])

  // keluar dari mode uji tiap ganti halaman PDF
  useEffect(() => {
    setModeUji(false)
    setRevealedIds(new Set())
  }, [pageNum])

  function pilihMode(m) {
    setModeUji(false) // edit tool & mode uji saling eksklusif
    setMode(cur => (cur === m ? null : m))
  }

  function toggleModeUji() {
    setModeUji(m => {
      const next = !m
      if (next) setMode(null)
      setRevealedIds(new Set())
      return next
    })
  }

  function toggleReveal(id) {
    setRevealedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ----- helper posisi mouse relatif ke halaman (0..1) -----
  function posisiRelatif(e) {
    const rect = overlayRef.current.getBoundingClientRect()
    return {
      x: Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1),
      y: Math.min(Math.max((e.clientY - rect.top) / rect.height, 0), 1),
    }
  }

  // ----- geser (drag) anotasi lewat pegangan -----
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
    if (item) {
      await supabase.from('pdf_highlights').update({ x: item.x, y: item.y }).eq('id', id)
    }
  }

  // ----- mode highlight: drag kotak -----
  function handleOverlayMouseDown(e) {
    if (mode === 'highlight') {
      const { x, y } = posisiRelatif(e)
      setDrawing({ startX: x, startY: y, x, y, width: 0, height: 0 })
    } else if (mode === 'text' && e.target === overlayRef.current) {
      const { x, y } = posisiRelatif(e)
      tambahTeks(x, y)
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
    const baru = { paket_id: paketId, pdf_path: pdfPath, page: pageNum, x, y, width, height, color: warnaHighlight, type: 'highlight' }
    const { data, error } = await supabase.from('pdf_highlights').insert(baru).select().single()
    if (error) { alert('Gagal simpan highlight: ' + error.message); return }
    setAnotasi(a => [...a, data])
  }

  // ----- mode teks: klik buat kotak catatan baru -----
  async function tambahTeks(x, y) {
    const baru = { paket_id: paketId, pdf_path: pdfPath, page: pageNum, x, y, width: 0.25, height: 0, color: warnaTeks, type: 'text', text: '' }
    const { data, error } = await supabase.from('pdf_highlights').insert(baru).select().single()
    if (error) { alert('Gagal bikin catatan: ' + error.message); return }
    setAnotasi(a => [...a, data])
    setEditingTeksId(data.id)
  }
  async function simpanTeks(id, text) {
    await supabase.from('pdf_highlights').update({ text }).eq('id', id)
    setAnotasi(a => a.map(x => (x.id === id ? { ...x, text } : x)))
  }
  async function hapusAnotasi(id) {
    await supabase.from('pdf_highlights').delete().eq('id', id)
    setAnotasi(a => a.filter(x => x.id !== id))
  }

  function gantiHalaman(delta) {
    setPageNum(p => Math.min(Math.max(p + delta, 1), numPages))
  }

  // ----- gabungkan render halaman + anotasi jadi PDF baru, lalu unduh -----
  async function unduhPdf() {
    if (!pdfDoc || exporting) return
    setExporting(true)
    try {
      const EXPORT_SCALE = 2
      let doc = null
      for (let i = 1; i <= numPages; i++) {
        const page = await pdfDoc.getPage(i)
        const viewport = page.getViewport({ scale: EXPORT_SCALE })
        const off = document.createElement('canvas')
        off.width = viewport.width
        off.height = viewport.height
        const ctx = off.getContext('2d')
        await page.render({ canvasContext: ctx, viewport }).promise

        const anotasiHal = anotasi.filter(a => a.page === i)

        anotasiHal.filter(a => a.type !== 'text').forEach(h => {
          ctx.save()
          ctx.globalAlpha = 0.4
          ctx.globalCompositeOperation = 'multiply'
          ctx.fillStyle = h.color
          ctx.fillRect(h.x * off.width, h.y * off.height, h.width * off.width, h.height * off.height)
          ctx.restore()
        })

        anotasiHal.filter(a => a.type === 'text' && a.text).forEach(t => {
          ctx.save()
          ctx.fillStyle = t.color || '#2d6a4a'
          const fontSize = 13 * EXPORT_SCALE
          ctx.font = `600 ${fontSize}px "Noto Serif JP", sans-serif`
          const baseX = t.x * off.width + 4 * EXPORT_SCALE
          let baseY = t.y * off.height + fontSize
          String(t.text).split('\n').forEach(line => {
            ctx.fillText(line, baseX, baseY)
            baseY += fontSize * 1.3
          })
          ctx.restore()
        })

        const imgData = off.toDataURL('image/jpeg', 0.92)
        if (!doc) {
          doc = new jsPDF({ unit: 'px', format: [off.width, off.height], hotfixes: ['px_scaling'] })
        } else {
          doc.addPage([off.width, off.height])
        }
        doc.addImage(imgData, 'JPEG', 0, 0, off.width, off.height)
      }
      const namaFile = (pdfPath?.split('/').pop()?.replace(/\.pdf$/i, '') || 'dokumen') + '-anotasi.pdf'
      doc.save(namaFile)
    } catch (err) {
      console.error('Gagal membuat PDF:', err)
      alert('Gagal mengunduh PDF: ' + (err?.message || 'terjadi kesalahan'))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="pdf-panel">
      <div className="pdf-panel-header" style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <button className="icon-btn" onClick={() => setScale(s => Math.max(s - 0.2, 0.6))}>－</button>
            <div style={{ fontSize: 12, color: '#1a1a1a', minWidth: 36, textAlign: 'center' }}>{Math.round(scale * 100)}%</div>
            <button className="icon-btn" onClick={() => setScale(s => Math.min(s + 0.2, 3))}>＋</button>
          </div>

          {highlightHalIni.length > 0 && (
            <button
              className="icon-btn"
              onClick={toggleModeUji}
              title="Mode Aka Shiito (uji hafalan): sembunyikan kata yang di-highlight"
              style={{
                background: modeUji ? '#c0392b' : '#fff',
                border: '1.5px solid #c0392b',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <svg width={16} height={16} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <rect x="3" y="4" width="18" height="16" rx="2" fill={modeUji ? '#fff' : '#c0392b'} fillOpacity={modeUji ? 0.9 : 0.25} stroke={modeUji ? '#fff' : '#c0392b'} strokeWidth="2" />
              </svg>
            </button>
          )}

          {modeUji && (
            <>
              <span style={{ fontSize: 11, color: '#1a1a1a', opacity: 0.7 }}>
                {revealedIds.size}/{highlightHalIni.length} dibuka
              </span>
              {revealedIds.size < highlightHalIni.length && (
                <button
                  className="icon-btn"
                  onClick={() => setRevealedIds(new Set(highlightHalIni.map(h => h.id)))}
                  title="Buka semua jawaban"
                  style={{ background: '#fff', border: '1.5px solid #2d6a4a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#2d6a4a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 9l6 5 6-5" />
                    <path d="M6 15l6 5 6-5" />
                  </svg>
                </button>
              )}
            </>
          )}

          {!modeUji && (
            <>
              <button
                className="icon-btn"
                onClick={() => pilihMode('highlight')}
                title="Highlight"
                style={{ background: mode === 'highlight' ? '#2d6a4a' : '#fff', color: mode === 'highlight' ? '#2d6a4a' : '#fff', border: '1.5px solid #2d6a4a' }}
              >🖍️</button>
              <button
                className="icon-btn"
                onClick={() => pilihMode('text')}
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
                onClick={() => pilihMode('hapus')}
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
                    border: warnaHighlight === w ? '2px solid #fff' : '1px solid rgba(255,255,255,.5)',
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
                    border: warnaTeks === w ? '2px solid #fff' : '1px solid rgba(255,255,255,.5)',
                  }}
                />
              ))}
            </>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifySelf: 'center' }}>
          <button className="icon-btn" onClick={() => gantiHalaman(-1)} disabled={pageNum <= 1} style={{ width: 34, height: 34, fontSize: 18 }}>‹</button>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(255,255,255,0.15)', borderRadius: 20, padding: '4px 14px 4px 4px',
          }}>
            <span style={{
              background: '#1a1a1a', color: '#fff', fontSize: 15, fontWeight: 600,
              borderRadius: 14, padding: '4px 13px', minWidth: 20, textAlign: 'center',
            }}>{pageNum}</span>
            <span style={{ fontSize: 15, color: '#1a1a1a', opacity: 0.75 }}>/ {numPages}</span>
          </div>
          <button className="icon-btn" onClick={() => gantiHalaman(1)} disabled={pageNum >= numPages} style={{ width: 34, height: 34, fontSize: 18 }}>›</button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifySelf: 'end' }}>
          {onHapusPdf && (
            <button className="icon-btn danger" onClick={() => setShowKonfirmasiHapus(true)} title="Hapus PDF">🗑️</button>
          )}
          <button
            className="icon-btn"
            onClick={unduhPdf}
            disabled={exporting || !pdfDoc}
            title="Unduh PDF dengan highlight & catatan"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: exporting ? 0.6 : 1 }}
          >
            {exporting ? <span style={{ fontSize: 11 }}>...</span> : <IconDownload color="#2d6a4a" size={16} />}
          </button>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
      </div>

      <div className="pdf-panel-body" style={{ overflow: 'auto', display: 'block', textAlign: 'center' }}>
        {loading ? (
          <div style={{ color: '#cde8d0', padding: 30 }}>Memuat PDF...</div>
        ) : errorMsg ? (
          <div style={{ color: '#f8b4a8', padding: 30, textAlign: 'center', maxWidth: 420, margin: '0 auto' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>⚠️</div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>PDF gagal dimuat</div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>{errorMsg}</div>
          </div>
        ) : (
          <div style={{ position: 'relative', width: canvasSize.width, height: canvasSize.height, display: 'inline-block' }}>
            <canvas ref={canvasRef} />
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
              {highlightHalIni.map(h => (
                <HighlightBox
                  key={h.id}
                  data={h}
                  onHapus={hapusAnotasi}
                  hapusMode={mode === 'hapus'}
                  modeUji={modeUji}
                  revealed={revealedIds.has(h.id)}
                  onToggleReveal={toggleReveal}
                />
              ))}

              {teksHalIni.map(t => (
                <CatatanTeks
                  key={t.id}
                  data={t}
                  autoFocus={t.id === editingTeksId}
                  onSimpan={simpanTeks}
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
              Hapus PDF ini?
            </div>
            <div style={{ fontSize: 13, color: '#5b6b60', marginBottom: 18, lineHeight: 1.5 }}>
              Semua highlight dan catatan di PDF ini juga akan ikut terhapus. Tindakan ini tidak bisa dibatalkan.
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
                onClick={() => { setShowKonfirmasiHapus(false); onHapusPdf() }}
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
