import { useEffect, useMemo, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { supabase } from '../supabaseClient'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc

const WARNA_HIGHLIGHT = ['#fff176', '#a5d6a7', '#f48fb1', '#90caf9']
const WARNA_TEKS = ['#2d6a4a', '#c0392b', '#1565c0', '#8e44ad', '#000000']

function CatatanTeks({ data, autoFocus, onSimpan, onHapus }) {
  const [text, setText] = useState(data.text || '')
  const [editing, setEditing] = useState(autoFocus || !data.text)
  const [hover, setHover] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (editing) ref.current?.focus()
  }, [editing])

  function selesai() {
    setEditing(false)
    if (text.trim()) onSimpan(data.id, text)
    else onHapus(data.id)
  }

  return (
    <div
      onMouseDown={e => e.stopPropagation()}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => !editing && setEditing(true)}
      style={{ position: 'absolute', left: data.x * 100 + '%', top: data.y * 100 + '%', minWidth: 60 }}
    >
      {editing ? (
        <textarea
          ref={ref}
          value={text}
          onChange={e => setText(e.target.value)}
          onBlur={selesai}
          rows={Math.max(1, text.split('\n').length)}
          placeholder="Tulis catatan..."
          style={{
            display: 'block', resize: 'both', minWidth: 120, minHeight: 30,
            fontSize: 15, padding: '5px 7px', border: '1.5px dashed #2d6a4a',
            borderRadius: 6, background: 'rgba(255,255,255,.95)', color: data.color || '#2d6a4a',
            fontFamily: "'Noto Serif JP', serif",
          }}
        />
      ) : (
        <div
          style={{
            fontSize: 15, fontWeight: 600, color: data.color || '#2d6a4a', cursor: 'text',
            whiteSpace: 'pre-wrap', fontFamily: "'Noto Serif JP', serif", padding: '2px 4px',
          }}
        >
          {data.text}
        </div>
      )}
      {hover && (
        <button
          onClick={() => onHapus(data.id)}
          title="Hapus catatan"
          style={{
            position: 'absolute', top: -8, right: -8, width: 18, height: 18, borderRadius: '50%',
            background: '#c0392b', color: '#fff', border: 'none', fontSize: 11, lineHeight: '18px',
            cursor: 'pointer', padding: 0,
          }}
        >×</button>
      )}
    </div>
  )
}

function HighlightBox({ data, onHapus }) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onMouseDown={e => e.stopPropagation()}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'absolute',
        left: data.x * 100 + '%', top: data.y * 100 + '%',
        width: data.width * 100 + '%', height: data.height * 100 + '%',
        background: data.color, opacity: 0.4, mixBlendMode: 'multiply',
      }}
    >
      {hover && (
        <button
          onClick={() => onHapus(data.id)}
          title="Hapus highlight"
          style={{
            position: 'absolute', top: -9, right: -9, width: 18, height: 18, borderRadius: '50%',
            background: '#c0392b', color: '#fff', border: 'none', fontSize: 11, lineHeight: '18px',
            cursor: 'pointer', padding: 0, mixBlendMode: 'normal', opacity: 1,
          }}
        >×</button>
      )}
    </div>
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
  const [warnaHighlight, setWarnaHighlight] = useState(WARNA_HIGHLIGHT[0])
  const [warnaTeks, setWarnaTeks] = useState(WARNA_TEKS[0])
  const [drawing, setDrawing] = useState(null)
  const [editingTeksId, setEditingTeksId] = useState(null)

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
          style={{
            background: mode === 'text' ? '#fff' : 'transparent', color: mode === 'text' ? '#2d6a4a' : '#fff',
            fontWeight: 700, fontStyle: 'italic', fontFamily: 'Georgia, serif', fontSize: 15,
          }}
        >Aa</button>

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

        <div style={{ flex: 1 }} />
        {onHapusPdf && (
          <button className="icon-btn danger" onClick={onHapusPdf} title="Hapus PDF">🗑️</button>
        )}
        <button className="icon-btn" onClick={onClose}>✕</button>
      </div>

      <div className="pdf-panel-body" style={{ overflow: 'auto', display: 'flex', justifyContent: 'center' }}>
        {loading ? (
          <div style={{ color: '#cde8d0', padding: 30 }}>Memuat PDF...</div>
        ) : errorMsg ? (
          <div style={{ color: '#f8b4a8', padding: 30, textAlign: 'center', maxWidth: 420 }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>⚠️</div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>PDF gagal dimuat</div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>{errorMsg}</div>
          </div>
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
                <HighlightBox key={h.id} data={h} onHapus={hapusAnotasi} />
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
                  background: warnaHighlight, opacity: 0.4, mixBlendMode: 'multiply',
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
