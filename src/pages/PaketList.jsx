import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'

export default function PaketList({ goTo, openPaket }) {
  const [paketList, setPaketList] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [collapsedGroups, setCollapsedGroups] = useState(new Set())
  const [initedCollapse, setInitedCollapse] = useState(false)
  const [exportLoading, setExportLoading] = useState(false)

  async function muatPaket() {
    setLoading(true)
    const { data, error } = await supabase
      .from('paket')
      .select('id, nama, tanggal, urutan, pdf_path, kata(count)')
      .order('urutan', { ascending: true })
    if (!error && data) {
      setPaketList(data.map(p => ({ ...p, jumlahKata: p.kata?.[0]?.count || 0 })))
    }
    setLoading(false)
  }

  useEffect(() => { muatPaket() }, [])

  async function loadScript(src) {
    if (document.querySelector(`script[src="${src}"]`)) return
    await new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = src
      s.onload = resolve
      s.onerror = reject
      document.body.appendChild(s)
    })
  }

  async function exportSemuaHafalan() {
    setExportLoading(true)
    try {
      const { data, error } = await supabase
        .from('kata')
        .select('jp, arti, paket:paket_id (nama, urutan)')
        .eq('hafal', true)
      if (error) throw error
      if (!data || data.length === 0) { alert('Belum ada kata yang hafal nih!'); setExportLoading(false); return }

      // Group by nama paket, urutkan sesuai urutan paket
      const byPaket = {}
      data.forEach(row => {
        const nama = row.paket?.nama || 'Tanpa paket'
        const urutan = row.paket?.urutan ?? 0
        if (!byPaket[nama]) byPaket[nama] = { urutan, items: [] }
        byPaket[nama].items.push(row)
      })
      const pakets = Object.entries(byPaket).sort((a, b) => a[1].urutan - b[1].urutan)

      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js')
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js')

      // Render ke elemen HTML sementara biar font Jepang ikut ke-render dengan benar
      const wrap = document.createElement('div')
      wrap.style.cssText = 'position:fixed; left:-9999px; top:0; width:700px; background:#fff; padding:32px; font-family: "DM Sans", sans-serif; color:#1a1a1a;'
      let html = `<div style="font-family:'Noto Serif JP', serif; font-size:20px; font-weight:700; color:#2d6a4a; margin-bottom:2px;">Kosakata Immersion — Daftar Hafalan</div>
        <div style="font-size:11px; color:#7aaa8a; margin-bottom:20px;">Diekspor: ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} · ${data.length} kata</div>`
      pakets.forEach(([nama, { items }]) => {
        html += `<div style="font-size:13px; font-weight:700; color:#1a1a1a; margin-top:18px; margin-bottom:8px; border-bottom:1.5px solid #b8d8b8; padding-bottom:4px;">${nama}</div>`
        items.forEach(it => {
          html += `<div style="display:flex; gap:10px; font-size:12px; padding:3px 0;">
            <div style="width:140px; font-family:'Noto Serif JP', serif; font-size:14px;">${it.jp}</div>
            <div style="color:#444;">${it.arti}</div>
          </div>`
        })
      })
      wrap.innerHTML = html
      document.body.appendChild(wrap)

      const canvas = await window.html2canvas(wrap, { scale: 2, backgroundColor: '#ffffff' })
      document.body.removeChild(wrap)

      const { jsPDF } = window.jspdf
      const pdf = new jsPDF('p', 'pt', 'a4')
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const imgWidth = pageWidth
      const imgHeight = (canvas.height * imgWidth) / canvas.width
      let heightLeft = imgHeight
      let position = 0
      const imgData = canvas.toDataURL('image/png')

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
      heightLeft -= pageHeight
      while (heightLeft > 0) {
        position = heightLeft - imgHeight
        pdf.addPage()
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
        heightLeft -= pageHeight
      }

      pdf.save(`kosakata-hafalan-${new Date().toISOString().slice(0, 10)}.pdf`)
    } catch (e) {
      alert('Gagal bikin PDF: ' + e.message)
    }
    setExportLoading(false)
  }

  async function exportTxtHafalan() {
    const { data, error } = await supabase
      .from('kata')
      .select('jp, arti, paket:paket_id (nama, urutan)')
      .eq('hafal', true)
    if (error) { alert('Gagal ambil data: ' + error.message); return }
    if (!data || data.length === 0) { alert('Belum ada kata yang hafal nih!'); return }

    const byPaket = {}
    data.forEach(row => {
      const nama = row.paket?.nama || 'Tanpa paket'
      const urutan = row.paket?.urutan ?? 0
      if (!byPaket[nama]) byPaket[nama] = { urutan, items: [] }
      byPaket[nama].items.push(row)
    })
    const pakets = Object.entries(byPaket).sort((a, b) => a[1].urutan - b[1].urutan)

    let txt = `Kosakata Immersion — Daftar Hafalan\nDiekspor: ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} · ${data.length} kata\n\n`
    pakets.forEach(([nama, { items }]) => {
      txt += `${nama}\n`
      items.forEach(it => { txt += `${it.jp} — ${it.arti}\n` })
      txt += '\n'
    })

    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `kosakata-hafalan-${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function tambahPaket() {
    if (!nama || !nama.trim()) return
    const tanggal = prompt('Tanggal/bulan paket ini (contoh: Januari 2026) — boleh dikosongin:', '')
    const urutanMin = paketList.length > 0 ? Math.min(...paketList.map(p => p.urutan)) - 1 : 0
    const { error } = await supabase.from('paket').insert({
      nama: nama.trim(), tanggal: tanggal ? tanggal.trim() : '', urutan: urutanMin,
    })
    if (error) alert('Gagal nambah paket: ' + error.message)
    else muatPaket()
  }

  async function editPaket(p) {
    const nama = prompt('Ubah nama paket:', p.nama)
    if (!nama || !nama.trim()) return
    const tanggal = prompt('Ubah tanggal/bulan paket (boleh dikosongin):', p.tanggal || '')
    const { error } = await supabase.from('paket')
      .update({ nama: nama.trim(), tanggal: tanggal !== null ? tanggal.trim() : (p.tanggal || '') })
      .eq('id', p.id)
    if (error) alert('Gagal update: ' + error.message)
    else muatPaket()
  }

  async function hapusPaket(p) {
    if (!confirm(`Hapus paket "${p.nama}" beserta semua katanya?`)) return
    const { error } = await supabase.from('paket').delete().eq('id', p.id)
    if (error) alert('Gagal hapus: ' + error.message)
    else muatPaket()
  }

  async function pindahUrutan(p, dir) {
    const idx = paketList.findIndex(x => x.id === p.id)
    const target = paketList[idx + dir]
    if (!target) return
    await supabase.from('paket').update({ urutan: target.urutan }).eq('id', p.id)
    await supabase.from('paket').update({ urutan: p.urutan }).eq('id', target.id)
    muatPaket()
  }

  // ---- Grouping per tanggal (berurutan, biar urutan manual tetap kepake) ----
  const groups = useMemo(() => {
    const out = []
    paketList.forEach((p, idx) => {
      const key = p.tanggal && p.tanggal.trim() ? p.tanggal.trim() : 'Tanpa tanggal'
      const last = out[out.length - 1]
      if (last && last.key === key) last.items.push({ p, idx })
      else out.push({ key, items: [{ p, idx }] })
    })
    return out
  }, [paketList])

  useEffect(() => {
    if (!initedCollapse && groups.length > 0) {
      setCollapsedGroups(new Set(groups.slice(1).map((g, i) => g.key + '#' + (i + 1))))
      setInitedCollapse(true)
    }
  }, [groups, initedCollapse])

  function toggleGroup(key) {
    const next = new Set(collapsedGroups)
    if (next.has(key)) next.delete(key); else next.add(key)
    setCollapsedGroups(next)
  }

  const term = search.trim().toLowerCase()
  const hasilSearch = term
    ? paketList.filter(p => p.nama.toLowerCase().includes(term))
    : null

  function RowPaket({ p, idx, showUrutan }) {
    return (
      <div className="paket-row">
        <div className="urutan-col" style={{ visibility: showUrutan ? 'visible' : 'hidden' }}>
          <button onClick={() => pindahUrutan(p, -1)} disabled={idx === 0}>▲</button>
          <button onClick={() => pindahUrutan(p, 1)} disabled={idx === paketList.length - 1}>▼</button>
        </div>
        <div className="info" onClick={() => openPaket(p.id)}>
          <div className="nama">
            <span>{p.nama}</span>
            {p.pdf_path && <span title="Ada PDF">📄</span>}
          </div>
          <div className="meta">
            <span>{p.jumlahKata} kata</span>
            {p.tanggal && <span className="badge-tanggal">📅 {p.tanggal}</span>}
          </div>
        </div>
        <button className="icon-btn" title="Ubah nama/tanggal" onClick={() => editPaket(p)}>✏️</button>
        <button className="icon-btn danger" title="Hapus paket" onClick={() => hapusPaket(p)}>✕</button>
      </div>
    )
  }

  return (
    <div className="cover" style={{ justifyContent: 'flex-start', paddingTop: 60 }}>
      <button className="back-fab" onClick={() => goTo('cover')}>←</button>
      <div className="cover-inner">
        <div className="cover-head">
          <div className="cover-emoji">📚</div>
          <div style={{ flex: 1 }}>
            <div className="cover-title" style={{ fontSize: 22 }}>Kosakata Immersion</div>
            <div className="cover-sub">kosakata dari keseharian</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              className="icon-btn" title="Download PDF (buat dibaca)" onClick={exportSemuaHafalan}
              disabled={exportLoading}
              style={{ width: 36, height: 36, fontSize: 16 }}
            >
              {exportLoading ? '⏳' : '📄'}
            </button>
            <button
              className="icon-btn" title="Download TXT (buat dikasih ke AI)" onClick={exportTxtHafalan}
              style={{ width: 36, height: 36, fontSize: 16 }}
            >
              📝
            </button>
          </div>
        </div>

        <input
          className="input-search" placeholder="🔍 Cari nama paket..."
          value={search} onChange={e => setSearch(e.target.value)}
        />

        {loading && <div style={{ textAlign: 'center', color: '#9abaa8', padding: 20 }}>Memuat...</div>}

        {!loading && paketList.length === 0 && (
          <div style={{ textAlign: 'center', color: '#9abaa8', fontSize: 12, padding: '20px 0' }}>
            Belum ada paket. Bikin yang pertama!
          </div>
        )}

        {!loading && term && hasilSearch && (
          <>
            <div style={{ fontSize: 11, color: '#9abaa8', marginBottom: 6 }}>{hasilSearch.length} paket ditemukan</div>
            {hasilSearch.map(p => (
              <RowPaket key={p.id} p={p} idx={paketList.findIndex(x => x.id === p.id)} showUrutan={false} />
            ))}
          </>
        )}

        {!loading && !term && groups.map((g, gi) => {
          const key = g.key + '#' + gi
          const collapsed = collapsedGroups.has(key)
          return (
            <div key={key}>
              <div className="group-header" onClick={() => toggleGroup(key)}>
                <span className="arrow" style={{ transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>▾</span>
                <span className="label">{g.key}</span>
                <span className="count">({g.items.length} paket)</span>
                <div className="line" />
              </div>
              {!collapsed && g.items.map(({ p, idx }) => (
                <RowPaket key={p.id} p={p} idx={idx} showUrutan={true} />
              ))}
            </div>
          )
        })}

        <button className="btn-dashed" onClick={tambahPaket}>＋ Paket baru</button>
      </div>
    </div>
  )
}
