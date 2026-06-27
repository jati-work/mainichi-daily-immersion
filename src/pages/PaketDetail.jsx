import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

function normalisasiJP(s) {
  return String(s).trim().toLowerCase().replace(/[\s、。！？・「」]/g, '').normalize('NFKC')
}

export default function PaketDetail({ paketId, goTo, userId }) {
  const [paket, setPaket] = useState(null)
  const [kataList, setKataList] = useState([])
  const [flipped, setFlipped] = useState(new Set())
  const [showForm, setShowForm] = useState(false)
  const [jp, setJp] = useState('')
  const [arti, setArti] = useState('')
  const [dup, setDup] = useState(null) // {paketNama, tanggal}
  const [showPdf, setShowPdf] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [pdfUrl, setPdfUrl] = useState(null)

  async function muatSemua() {
    const { data: p } = await supabase.from('paket').select('*').eq('id', paketId).single()
    setPaket(p)
    const { data: k } = await supabase.from('kata').select('*').eq('paket_id', paketId).order('created_at')
    setKataList(k || [])
  }

  useEffect(() => { muatSemua() }, [paketId])

  function toggleFlip(id) {
    const next = new Set(flipped)
    if (next.has(id)) next.delete(id); else next.add(id)
    setFlipped(next)
  }

  async function toggleHafal(k) {
    await supabase.from('kata').update({ hafal: !k.hafal }).eq('id', k.id)
    muatSemua()
  }

  async function hapusKata(k) {
    if (!confirm(`Hapus "${k.jp}"?`)) return
    await supabase.from('kata').delete().eq('id', k.id)
    muatSemua()
  }

  // ===== ACTIVE RECALL: cek duplikat kanji/kana ke SEMUA paket milik user =====
  async function cekDuplikat(jpText) {
    const norm = normalisasiJP(jpText)
    if (!norm) return null
    const { data } = await supabase
      .from('kata')
      .select('jp, paket:paket_id (nama, tanggal)')
      .eq('user_id', userId)
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
      paket_id: paketId, jp: jp.trim(), arti: arti.trim(), user_id: userId,
    })
    if (error) { alert('Gagal simpan: ' + error.message); return }
    setJp(''); setArti('')
    muatSemua()
  }

  // ===== PDF =====
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
    const path = `${userId}/${paketId}-${Date.now()}.pdf`
    const { error: upErr } = await supabase.storage.from('immersion-pdfs').upload(path, file, { upsert: true })
    if (upErr) { alert('Gagal upload: ' + upErr.message); setUploading(false); return }
    await supabase.from('paket').update({ pdf_path: path }).eq('id', paketId)
    setUploading(false)
    await muatSemua()
    bukaPdf()
  }

  async function hapusPdf() {
    if (!confirm('Hapus PDF dari paket ini?')) return
    if (paket.pdf_path) await supabase.storage.from('immersion-pdfs').remove([paket.pdf_path])
    await supabase.from('paket').update({ pdf_path: null }).eq('id', paketId)
    setShowPdf(false)
    muatSemua()
  }

  if (!paket) return <div style={{ padding: 40, textAlign: 'center', color: '#9abaa8' }}>Memuat...</div>

  const jumlahHafal = kataList.filter(k => k.hafal).length

  return (
    <div>
      <div className="header-bar">
        <button className="icon-btn" onClick={() => goTo('paket')} title="Kembali">←</button>
        <div className="title">{paket.nama}</div>
        <button
          className={`act-btn ${paket.pdf_path ? 'active' : ''}`}
          onClick={bukaPdf} title={paket.pdf_path ? 'Lihat PDF' : 'Belum ada PDF'}
        >📄</button>
        <div className="stats">{kataList.length} kata · ✓ {jumlahHafal} hafal</div>
      </div>

      <div className="actions">
        <button className="act-btn" onClick={() => setShowForm(s => !s)}>＋ Kata</button>
      </div>

      {showForm && (
        <div style={{ background: '#f0f7f0', borderRadius: 10, padding: 14, margin: '0 10px 10px', border: '1.5px solid #b8d8b8' }}>
          <input placeholder="Kata JP (kanji/kana)" value={jp} onChange={e => setJp(e.target.value)}
            style={{ width: '100%', padding: 8, borderRadius: 8, border: '1.5px solid #b8d8b8', marginBottom: 8, fontFamily: "'Noto Serif JP', serif" }} />
          <input placeholder="Arti ID" value={arti} onChange={e => setArti(e.target.value)}
            style={{ width: '100%', padding: 8, borderRadius: 8, border: '1.5px solid #b8d8b8', marginBottom: 8 }} />
          <button className="act-btn active" onClick={simpanKata}>Simpan</button>
        </div>
      )}

      <div className="grid-wrap">
        <div className="card-grid">
          {kataList.map((k, i) => (
            <div key={k.id} className={`card ${i % 2 === 0 ? '' : ''} ${flipped.has(k.id) ? 'flipped' : ''} ${k.hafal ? 'hafal' : ''}`}>
              <div className="card-inner" onClick={() => toggleFlip(k.id)}>
                <div className="card-front">{k.jp}</div>
                <div className="card-back">{k.arti}</div>
              </div>
              <button className="hafal-toggle" onClick={(e) => { e.stopPropagation(); toggleHafal(k) }}>✓</button>
            </div>
          ))}
        </div>
        {kataList.length === 0 && (
          <div style={{ textAlign: 'center', color: '#9abaa8', padding: 40, fontSize: 13 }}>
            Belum ada kata. Klik ＋ Kata buat mulai!
          </div>
        )}
      </div>

      {/* Modal duplikat — active recall, gak nampilin arti */}
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

      {/* Panel PDF full overlay */}
      {showPdf && (
        <div className="pdf-panel">
          <div className="pdf-panel-header">
            <div style={{ flex: 1, fontWeight: 700, color: '#2d6a4a', fontSize: 13 }}>📄 {paket.nama}</div>
            {paket.pdf_path && (
              <button className="icon-btn danger" onClick={hapusPdf}>🗑️ Hapus</button>
            )}
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
    </div>
  )
}
