import { useEffect, useMemo, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { supabase } from '../supabaseClient'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc

const WARNA_LIST = ['#fff176', '#a5d6a7', '#f48fb1', '#90caf9']

function CatatanTeks({ data, autoFocus, onSimpan, onHapus }) {
  const [text, setText] = useState(data.text || '')
  const ref = useRef(null)

  useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [autoFocus])

  return (
    <div
      onMouseDown={e => e.stopPropagation()}
      style={{ position: 'absolute', left: data.x * 100 + '%', top: data.y * 100 + '%', minWidth: 120 }}
    >
      <textarea
        ref={ref}
        value={text}
        onChange={e => setText(e.target.value)}
        onBlur={() => (text.trim() ? onSimpan(data.id, text) : onHapus(data.id))}
        rows={Math.max(1, text.split('\n').length)}
        placeholder="Tulis catatan..."
        style={{
          display: 'block', resize: 'both', minWidth: 120, minHeight: 30,
          fontSize: 13, padding: '5px 7px', border: '1.5px dashed #2d6a4a',
          borderRadius: 6, background: 'rgba(255,255,255,.95)', color: '#1a3a2a',
          fontFamily: "'Noto Serif JP', serif",
        }}
      />
      <button
        onClick={() => onHapus(data.id)}
        title="Hapus catatan"
        style={{
          position: 'absolute', top: -8, right: -8, width: 18, height: 18, borderRadius: '50%',
          background: '#c0392b', color: '#fff', border: 'none', fontSize: 11, lineHeight: '18px',
          cursor: 'pointer', padding: 0,
        }}
      >×</button>
    </div>
  )
}

// paketId, pdfPath, pdfUrl (signed url), onClose: props dari PaketDetail
export default function PdfHighlighter({ paketId, pdfPath, pdfUrl, onClose, onHapusPdf }) {
  const [pdfDoc, setPdfDoc] = useState(null)
  const [numPages, setNumPages] = useState(0)
  const [pageNum, setPageNum] = useState(1)
  const [scale, setScale] = useState(1.2)
  const [loading, setLoading] = useState(true)
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 })

  const [anotasi, setAnotasi] = useState([])
  const [mode, setMode] = useState(null) // null | 'highlight' | 'text'
  const [warna, setWarna] = useState(WARNA_LIST[0])
  const [drawing, setDrawing] = useState(null)
  const [editingTeksId, setEditingTeksId] = useState(null)

  const canvasRef = useRef(null)
  const overlayRef = useRef(null)

  // ----- load dokumen PDF -----
  useEffect(() => {
    let batal = false
    async function muat() {
      setLoading(true)
      const doc = await pdfjsLib.getDocument(pdfUrl).promise
      if (batal) return
      setPdfDoc(doc)
      setNumPages(doc.numPages)
      setPageNum(1)
      setLoading(false)
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
      canvas.width = viewport.width
      canvas.height = viewport.height
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

  // ----- helper posisi mouse relatif ke halaman (0..1) -----
  function posisiRelatif(e) {
    const rect = overlayRef.current.getBoundingClientRect()
    return {
      x: Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1),
      y: Math.min(Math.max((e.clientY - rect.top) / rect.height, 0), 1),
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
    if (!drawing) return
    const { x, y, width, height } = drawing
    setDrawing(null)
    if (width < 0.004 || height < 0.004) return
    const baru = { paket_id: paketId, pdf_path: pdfPath, page: pageNum, x, y, width, height, color: warna, type: 'highlight' }
    const { data, error } = await supabase.from('pdf_highlights').insert(baru).select().single()
    if (error) { alert('Gagal simpan highlight: ' + error.message); return }
    setAnotasi(a => [...a, data])
  }

  // ----- mode teks: klik buat kotak catatan baru -----
  async function tambahTeks(x, y) {
    const baru = { paket_id: paketId, pdf_path: pdfPath, page: pageNum, x, y, width: 0.25, height: 0, color: warna, type: 'text', text: '' }
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

  return (
    <div className="pdf-panel">
      <div className="pdf-panel-header" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button className="icon-btn" onClick={() => gantiHalaman(-1)} disabled={pageNum <= 1}>‹</button>
        <div style={{ fontSize: 12, color: '#fff', minWidth: 56, textAlign: 'center' }}>{pageNum} / {numPages}</div>
        <button className="icon-btn" onClick={() => gantiHalaman(1)} disabled={pageNum >= numPages}>›</button>

        <button className="icon-btn" onClick={() => setScale(s => Math.max(s - 0.2, 0.6))}>－</button>
        <div style={{ fontSize: 12, color: '#fff', minWidth: 40, textAlign: 'center' }}>{Math.round(scale * 100)}%</div>
        <button className="icon-btn" onClick={() => setScale(s => Math.min(s + 0.2, 3))}>＋</button>

        <button
          className="icon-btn"
          onClick={() => setMode(m => (m === 'highlight' ? null : 'highlight'))}
          title="Highlight"
          style={{ background: mode === 'highlight' ? '#fff' : 'transparent', color: mode === 'highlight' ? '#2d6a4a' : '#fff' }}
        >🖍️</button>
        <button
          className="icon-btn"
          onClick={() => setMode(m => (m === 'text' ? null : 'text'))}
          title="Catatan teks"
          style={{ background: mode === 'text' ? '#fff' : 'transparent', color: mode === 'text' ? '#2d6a4a' : '#fff' }}
        >📝</button>

        {mode === 'highlight' && WARNA_LIST.map(w => (
          <button
            key={w}
            onClick={() => setWarna(w)}
            title={w}
            style={{
              width: 20, height: 20, borderRadius: '50%', background: w, cursor: 'pointer',
              border: warna === w ? '2px solid #fff' : '1px solid rgba(255,255,255,.5)',
            }}
          />
        ))}

        <div style={{ flex: 1 }} />
        {onHapusPdf && (
          <button className="icon-btn danger" onClick={onHapusPdf} title="Hapus PDF">🗑️</button>
        )}
        <button className="icon-btn" onClick={onClose}>✕</button>
      </div>

      <div className="pdf-panel-body" style={{ overflow: 'auto', display: 'flex', justifyContent: 'center' }}>
        {loading ? (
          <div style={{ color: '#cde8d0', padding: 30 }}>Memuat PDF...</div>
        ) : (
          <div style={{ position: 'relative', width: canvasSize.width, height: canvasSize.height }}>
            <canvas ref={canvasRef} />
            <div
              ref={overlayRef}
              onMouseDown={handleOverlayMouseDown}
              onMouseMove={handleOverlayMouseMove}
              onMouseUp={handleOverlayMouseUp}
              onMouseLeave={() => setDrawing(null)}
              style={{
                position: 'absolute', inset: 0,
                cursor: mode === 'highlight' ? 'crosshair' : mode === 'text' ? 'text' : 'default',
              }}
            >
              {highlightHalIni.map(h => (
                <div
                  key={h.id}
                  onMouseDown={e => e.stopPropagation()}
                  onDoubleClick={() => hapusAnotasi(h.id)}
                  title="Klik dua kali untuk hapus"
                  style={{
                    position: 'absolute',
                    left: h.x * 100 + '%', top: h.y * 100 + '%',
                    width: h.width * 100 + '%', height: h.height * 100 + '%',
                    background: h.color, opacity: 0.4, mixBlendMode: 'multiply',
                    cursor: 'pointer',
                  }}
                />
              ))}

              {teksHalIni.map(t => (
                <CatatanTeks
                  key={t.id}
                  data={t}
                  autoFocus={t.id === editingTeksId}
                  onSimpan={simpanTeks}
                  onHapus={hapusAnotasi}
                />
              ))}

              {drawing && (
                <div style={{
                  position: 'absolute',
                  left: drawing.x * 100 + '%', top: drawing.y * 100 + '%',
                  width: drawing.width * 100 + '%', height: drawing.height * 100 + '%',
                  background: warna, opacity: 0.4, mixBlendMode: 'multiply',
                  pointerEvents: 'none',
                }} />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
