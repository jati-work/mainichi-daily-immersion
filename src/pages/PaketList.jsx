import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'

export default function PaketList({ goTo, openPaket }) {
  const [paketList, setPaketList] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [collapsedGroups, setCollapsedGroups] = useState(new Set())
  const [initedCollapse, setInitedCollapse] = useState(false)
  const [exportLoading, setExportLoading] = useState(false)
  const [showGrupMenu, setShowGrupMenu] = useState(null) // isinya key grup yang lagi buka menu

  async function muatPaket() {
    setLoading(true)
    const { data, error } = await supabase
      .from('paket')
      .select('id, nama, tanggal, urutan, urutan_grup, urutan_dalam_grup, pdf_path, kata(count), diary_pages(isi_teks)')
      .order('urutan_grup', { ascending: true })
      .order('urutan_dalam_grup', { ascending: true })
    if (!error && data) {
      setPaketList(data.map(p => ({
        ...p,
        jumlahKata: p.kata?.[0]?.count || 0,
        adaIsiDiary: (p.diary_pages || []).some(d => d.isi_teks && d.isi_teks.trim().length > 0),
      })))
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

      const wrap = document.createElement('div')
      wrap.style.cssText = 'position:fixed; left:-9999px; top:0; width:700px; background:#fff; padding:32px; font-family: "DM Sans", sans-serif; color:#1a1a1a;'
      let html = `<div style="font-family:'Noto Serif JP', serif; font-size:20px; font-weight:700; color:#2d6a4a; margin-bottom:2px;">Kosakata Immersion — Daftar Hafalan</div>
        <div style="font-size:11px; color:#7aaa8a; margin-bottom:20px;">Diekspor: ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} · ${data.length} kata</div>`
      pakets.forEach(([nama, { items }]) => {
        html += `<div style="font-size:13px; font-weight:700; color:#1a1a1a; margin-top:18px; margin-bottom:8px; border-bottom:1.5px solid #b8d8b8; padding-bottom:4px;">${nama}</div>`
        items.forEach(it => {
          html += `<div style="display:grid; grid-template-columns:320px 1fr; gap:0; align-items:baseline; font-size:12px; padding:10px 4px; border-bottom:1px solid #e5e5e5;">
            <div style="font-family:'Noto Serif JP', serif; font-size:15px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${it.jp}</div>
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
      txt += `**${nama}**\n`
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

  // Tambah paket di dalam grup tertentu
  async function tambahPaketDiGrup(namaGrup, urutanGrup) {
    const nama = prompt('Nama paket baru (contoh: N3 Mojigoi - Kanji Yomi):')
    if (!nama || !nama.trim()) return
    const anakGrup = paketList.filter(p => p.tanggal === namaGrup)
    const urutanDalamGrupMax = anakGrup.length > 0 ? Math.max(...anakGrup.map(p => p.urutan_dalam_grup ?? 0)) + 1 : 0
    const { error } = await supabase.from('paket').insert({
      nama: nama.trim(),
      tanggal: namaGrup,
      urutan: urutanDalamGrupMax,
      urutan_grup: urutanGrup,
      urutan_dalam_grup: urutanDalamGrupMax,
    })
    if (error) alert('Gagal nambah paket: ' + error.message)
    else muatPaket()
  }

  // Tambah grup baru
  async function tambahGrup() {
    const nama = prompt('Nama grup baru (contoh: Nihon No Mori - Mojigoi):')
    if (!nama || !nama.trim()) return
    const urutanGrupMax = groups.length > 0 ? Math.max(...groups.map(g => g.urutanGrup ?? 0)) + 1 : 0
    const namaPaket = prompt('Nama paket pertama di grup ini:')
    if (!namaPaket || !namaPaket.trim()) return
    const { error } = await supabase.from('paket').insert({
      nama: namaPaket.trim(),
      tanggal: nama.trim(),
      urutan: urutanGrupMax,
      urutan_grup: urutanGrupMax,
      urutan_dalam_grup: 0,
    })
    if (error) alert('Gagal nambah grup: ' + error.message)
    else muatPaket()
  }

  async function renameGrup(namaLama) {
  const namaBaru = prompt('Nama baru untuk grup ini:', namaLama)
  if (!namaBaru || !namaBaru.trim() || namaBaru.trim() === namaLama) return
  const ids = paketList.filter(p => p.tanggal === namaLama).map(p => p.id)
  for (const id of ids) {
    await supabase.from('paket').update({ tanggal: namaBaru.trim() }).eq('id', id)
  }
  muatPaket()
}

async function hapusGrup(namaGrup) {
  const anak = paketList.filter(p => p.tanggal === namaGrup)
  if (!confirm(`Hapus grup "${namaGrup}" beserta ${anak.length} paket dan semua katanya?`)) return
  for (const p of anak) {
    await supabase.from('paket').delete().eq('id', p.id)
  }
  muatPaket()
}

  async function editPaket(p) {
    const nama = prompt('Ubah nama paket:', p.nama)
    if (!nama || !nama.trim()) return
    const tanggal = prompt('Ubah nama grup:', p.tanggal || '')
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

  // Pindah urutan paket dalam grup
  async function pindahDalamGrup(p, dir, itemsGrup) {
    const idx = itemsGrup.findIndex(x => x.p.id === p.id)
    const target = itemsGrup[idx + dir]
    if (!target) return
    await supabase.from('paket').update({ urutan_dalam_grup: target.p.urutan_dalam_grup }).eq('id', p.id)
    await supabase.from('paket').update({ urutan_dalam_grup: p.urutan_dalam_grup }).eq('id', target.p.id)
    muatPaket()
  }

  // Pindah urutan grup (bawa semua anak)
  async function pindahGrup(namaGrup, dir) {
    const idx = groups.findIndex(g => g.key === namaGrup)
    const target = groups[idx + dir]
    if (!target) return
    const urutanLama = groups[idx].urutanGrup
    const urutanTarget = target.urutanGrup
    // Swap urutan_grup semua paket di dua grup ini
    const idsGrupIni = groups[idx].items.map(x => x.p.id)
    const idsGrupTarget = target.items.map(x => x.p.id)
    for (const id of idsGrupIni) {
      await supabase.from('paket').update({ urutan_grup: urutanTarget }).eq('id', id)
    }
    for (const id of idsGrupTarget) {
      await supabase.from('paket').update({ urutan_grup: urutanLama }).eq('id', id)
    }
    muatPaket()
  }

  // Grouping per tanggal, diurutkan pakai urutan_grup
  const groups = useMemo(() => {
    const map = {}
    paketList.forEach((p, idx) => {
      const key = p.tanggal && p.tanggal.trim() ? p.tanggal.trim() : 'Tanpa grup'
      if (!map[key]) map[key] = { key, urutanGrup: p.urutan_grup ?? 0, items: [] }
      map[key].items.push({ p, idx })
    })
    return Object.values(map).sort((a, b) => a.urutanGrup - b.urutanGrup)
  }, [paketList])

  useEffect(() => {
    if (!initedCollapse && groups.length > 0) {
      setCollapsedGroups(new Set(groups.slice(1).map((g, i) => g.key + '#' + (i + 1))))
      setInitedCollapse(true)
    }
  }, [groups, initedCollapse])

  useEffect(() => {
  function handleClickOutside(e) {
    if (!e.target.closest('[data-grup-menu]')) setShowGrupMenu(null)
  }
  document.addEventListener('mousedown', handleClickOutside)
  return () => document.removeEventListener('mousedown', handleClickOutside)
}, [])

  function toggleGroup(key) {
    const next = new Set(collapsedGroups)
    if (next.has(key)) next.delete(key); else next.add(key)
    setCollapsedGroups(next)
  }

  const term = search.trim().toLowerCase()
  const hasilSearch = term
    ? paketList.filter(p => p.nama.toLowerCase().includes(term))
    : null

  function RowPaket({ p, itemsGrup }) {
    const idxDalamGrup = itemsGrup.findIndex(x => x.p.id === p.id)
    return (
      <div className="paket-row">
        <div className="urutan-col">
          <button onClick={() => pindahDalamGrup(p, -1, itemsGrup)} disabled={idxDalamGrup === 0}>▲</button>
          <button onClick={() => pindahDalamGrup(p, 1, itemsGrup)} disabled={idxDalamGrup === itemsGrup.length - 1}>▼</button>
        </div>
        <div className="info" onClick={() => openPaket(p.id)}>
          <div className="nama">
            <span>{p.nama}</span>
            {p.pdf_path && <span title="Ada PDF">📄</span>}
            {p.adaIsiDiary && <span title="Ada catatan diary">📔</span>}
          </div>
          <div className="meta">
            <span>{p.jumlahKata} kata</span>
          </div>
        </div>
        <button className="icon-btn" title="Ubah nama/grup" onClick={() => editPaket(p)}>✏️</button>
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
              style={{ width: 36, height: 36, fontSize: 11, fontWeight: 700 }}
            >
              {exportLoading ? '⏳' : 'PDF'}
            </button>
            <button
              className="icon-btn" title="Download TXT (buat dikasih ke AI)" onClick={exportTxtHafalan}
              style={{ width: 36, height: 36, fontSize: 11, fontWeight: 700 }}
            >
              MD
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
            Belum ada paket. Bikin grup pertama!
          </div>
        )}

        {!loading && term && hasilSearch && (
          <>
            <div style={{ fontSize: 11, color: '#9abaa8', marginBottom: 6 }}>{hasilSearch.length} paket ditemukan</div>
            {hasilSearch.map(p => {
              const grup = groups.find(g => g.items.some(x => x.p.id === p.id))
              return <RowPaket key={p.id} p={p} itemsGrup={grup?.items || []} />
            })}
          </>
        )}

        <button className="btn-dashed" onClick={tambahGrup}>＋ Grup baru</button>

        {!loading && !term && groups.map((g, gi) => {
          const key = g.key + '#' + gi
          const collapsed = collapsedGroups.has(key)
          return (
            <div key={key}>
              <div className="group-header" onClick={() => toggleGroup(key)}>
                <div className="urutan-col" style={{ visibility: 'visible' }} onClick={e => e.stopPropagation()}>
                  <button onClick={() => pindahGrup(g.key, -1)} disabled={gi === 0}>▲</button>
                  <button onClick={() => pindahGrup(g.key, 1)} disabled={gi === groups.length - 1}>▼</button>
                </div>
                <span className="arrow" style={{ transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>▾</span>
                <span className="label">{g.key}</span>
                <span className="count">({g.items.length} paket)</span>
                <div className="line" />
                <div style={{ position: 'relative' }} data-grup-menu onClick={e => e.stopPropagation()}>
                  <button className="act-btn" onClick={() => setShowGrupMenu(showGrupMenu === key ? null : key)}>⋯</button>
                  {showGrupMenu === key && (
                    <div style={{
                      position: 'absolute', right: 0, top: 32, background: '#fff', border: '1.5px solid #ddd',
                      borderRadius: 10, padding: 6, display: 'flex', flexDirection: 'column', gap: 4,
                      boxShadow: '0 4px 16px rgba(0,0,0,.1)', zIndex: 20, minWidth: 160,
                    }}>
                      <button className="act-btn" style={{ textAlign: 'left' }} onClick={() => { tambahPaketDiGrup(g.key, g.urutanGrup); setShowGrupMenu(null) }}>＋ Tambah Paket</button>
                      <button className="act-btn" style={{ textAlign: 'left' }} onClick={() => { renameGrup(g.key); setShowGrupMenu(null) }}>✏️ Rename Grup</button>
                      <div style={{ height: 1, background: '#eee', margin: '2px 0' }} />
                      <button className="act-btn" style={{ textAlign: 'left', color: '#c0392b' }} onClick={() => { hapusGrup(g.key); setShowGrupMenu(null) }}>🗑️ Hapus Grup</button>
                    </div>
                  )}
                </div>
              </div>
              {!collapsed && g.items.map(({ p }) => (
                <RowPaket key={p.id} p={p} itemsGrup={g.items} />
              ))}
            </div>
          )
        })}

      </div>
    </div>
  )
}
