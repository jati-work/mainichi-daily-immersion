import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'

export default function PaketList({ goTo, openPaket }) {
  const [folders, setFolders] = useState([])
  const [paketList, setPaketList] = useState([])
  const [currentFolderId, setCurrentFolderId] = useState(null) // null = root/beranda
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [exportLoading, setExportLoading] = useState(false)
  const [movePicker, setMovePicker] = useState(null) // { type: 'folder'|'paket', item }

  async function muatData() {
    setLoading(true)
    const [{ data: fData, error: fErr }, { data: pData, error: pErr }] = await Promise.all([
      supabase.from('folders').select('id, nama, parent_id, urutan').order('urutan', { ascending: true }),
      supabase
        .from('paket')
        .select('id, nama, folder_id, urutan_dalam_grup, pdf_path, kata(count), diary_pages(isi_teks)')
        .order('urutan_dalam_grup', { ascending: true }),
    ])
    if (!fErr && fData) setFolders(fData)
    if (!pErr && pData) {
      setPaketList(pData.map(p => ({
        ...p,
        jumlahKata: p.kata?.[0]?.count || 0,
        adaIsiDiary: (p.diary_pages || []).some(d => d.isi_teks && d.isi_teks.trim().length > 0),
      })))
    }
    setLoading(false)
  }

  useEffect(() => { muatData() }, [])

  // ---------- helper: struktur folder ----------
  function anakFolder(parentId) {
    return folders.filter(f => f.parent_id === parentId).sort((a, b) => a.urutan - b.urutan)
  }
  function anakPaket(folderId) {
    return paketList.filter(p => p.folder_id === folderId).sort((a, b) => (a.urutan_dalam_grup ?? 0) - (b.urutan_dalam_grup ?? 0))
  }
  function jejakBreadcrumb(id) {
    const path = []
    let cur = folders.find(f => f.id === id)
    while (cur) { path.unshift(cur); cur = folders.find(f => f.id === cur.parent_id) }
    return path
  }
  // semua id folder di bawah (dan termasuk) folder ini -- dipakai buat cegah
  // "pindahin folder ke dalam anaknya sendiri" dan buat hitung isi pas mau dihapus
  function idFolderTurunan(id) {
    const hasil = new Set([id])
    let berubah = true
    while (berubah) {
      berubah = false
      folders.forEach(f => {
        if (f.parent_id && hasil.has(f.parent_id) && !hasil.has(f.id)) { hasil.add(f.id); berubah = true }
      })
    }
    return hasil
  }

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

  // ---------- aksi folder ----------
  async function tambahFolder() {
    const nama = prompt('Nama folder baru:')
    if (!nama || !nama.trim()) return
    const siblings = anakFolder(currentFolderId)
    const urutan = siblings.length ? Math.max(...siblings.map(f => f.urutan)) + 1 : 0
    const { error } = await supabase.from('folders').insert({ nama: nama.trim(), parent_id: currentFolderId, urutan })
    if (error) alert('Gagal bikin folder: ' + error.message)
    else muatData()
  }

  async function renameFolder(f) {
    const nama = prompt('Nama baru untuk folder ini:', f.nama)
    if (!nama || !nama.trim() || nama.trim() === f.nama) return
    const { error } = await supabase.from('folders').update({ nama: nama.trim() }).eq('id', f.id)
    if (error) alert('Gagal rename: ' + error.message)
    else muatData()
  }

  async function hapusFolder(f) {
    const idTurunan = [...idFolderTurunan(f.id)]
    const jumlahSubfolder = idTurunan.length - 1
    const jumlahPaket = paketList.filter(p => idTurunan.includes(p.folder_id)).length
    const pesan = (jumlahSubfolder > 0 || jumlahPaket > 0)
      ? `Hapus folder "${f.nama}"? Ini juga bakal ngehapus ${jumlahSubfolder} sub-folder dan ${jumlahPaket} paket beserta semua katanya.`
      : `Hapus folder "${f.nama}"?`
    if (!confirm(pesan)) return
    if (jumlahPaket > 0) {
      const { error } = await supabase.from('paket').delete().in('folder_id', idTurunan)
      if (error) { alert('Gagal hapus isi folder: ' + error.message); return }
    }
    const { error } = await supabase.from('folders').delete().eq('id', f.id)
    if (error) { alert('Gagal hapus folder: ' + error.message); return }
    if (currentFolderId && idTurunan.includes(currentFolderId)) setCurrentFolderId(f.parent_id ?? null)
    muatData()
  }

  async function pindahFolderKe(f, targetParentId) {
    if (f.id === targetParentId) return
    if (idFolderTurunan(f.id).has(targetParentId)) { alert('Gak bisa pindahin folder ke dalam dirinya sendiri / anaknya sendiri.'); return }
    const siblings = anakFolder(targetParentId).filter(x => x.id !== f.id)
    const urutan = siblings.length ? Math.max(...siblings.map(x => x.urutan)) + 1 : 0
    const { error } = await supabase.from('folders').update({ parent_id: targetParentId, urutan }).eq('id', f.id)
    if (error) alert('Gagal pindah: ' + error.message)
    else { setMovePicker(null); muatData() }
  }

  async function pindahUrutanFolder(f, dir) {
    const items = anakFolder(f.parent_id)
    const idx = items.findIndex(x => x.id === f.id)
    const target = items[idx + dir]
    if (!target) return
    await supabase.from('folders').update({ urutan: target.urutan }).eq('id', f.id)
    await supabase.from('folders').update({ urutan: f.urutan }).eq('id', target.id)
    muatData()
  }

  // ---------- aksi paket ----------
  async function tambahPaketDiFolder() {
    const nama = prompt('Nama paket baru (contoh: N3 Mojigoi - Kanji Yomi):')
    if (!nama || !nama.trim()) return
    const siblings = anakPaket(currentFolderId)
    const urutan = siblings.length ? Math.max(...siblings.map(x => x.urutan_dalam_grup ?? 0)) + 1 : 0
    const { error } = await supabase.from('paket').insert({
      nama: nama.trim(), folder_id: currentFolderId, urutan_dalam_grup: urutan, urutan,
    })
    if (error) alert('Gagal nambah paket: ' + error.message)
    else muatData()
  }

  async function editPaket(p) {
    const nama = prompt('Ubah nama paket:', p.nama)
    if (!nama || !nama.trim()) return
    const { error } = await supabase.from('paket').update({ nama: nama.trim() }).eq('id', p.id)
    if (error) alert('Gagal update: ' + error.message)
    else muatData()
  }

  async function hapusPaket(p) {
    if (!confirm(`Hapus paket "${p.nama}" beserta semua katanya?`)) return
    const { error } = await supabase.from('paket').delete().eq('id', p.id)
    if (error) alert('Gagal hapus: ' + error.message)
    else muatData()
  }

  async function pindahDalamFolder(p, dir) {
    const items = anakPaket(currentFolderId)
    const idx = items.findIndex(x => x.id === p.id)
    const target = items[idx + dir]
    if (!target) return
    await supabase.from('paket').update({ urutan_dalam_grup: target.urutan_dalam_grup }).eq('id', p.id)
    await supabase.from('paket').update({ urutan_dalam_grup: p.urutan_dalam_grup }).eq('id', target.id)
    muatData()
  }

  async function pindahPaketKe(p, targetFolderId) {
    const siblings = anakPaket(targetFolderId).filter(x => x.id !== p.id)
    const urutan = siblings.length ? Math.max(...siblings.map(x => x.urutan_dalam_grup ?? 0)) + 1 : 0
    const { error } = await supabase.from('paket').update({ folder_id: targetFolderId, urutan_dalam_grup: urutan }).eq('id', p.id)
    if (error) alert('Gagal pindah: ' + error.message)
    else { setMovePicker(null); muatData() }
  }

  const subfolderIni = useMemo(() => anakFolder(currentFolderId), [folders, currentFolderId])
  const paketIni = useMemo(() => anakPaket(currentFolderId), [paketList, currentFolderId])
  const jejak = useMemo(() => jejakBreadcrumb(currentFolderId), [folders, currentFolderId])

  const term = search.trim().toLowerCase()
  const hasilSearch = term ? paketList.filter(p => p.nama.toLowerCase().includes(term)) : null

  function RowFolder({ f, siblings }) {
    const idx = siblings.findIndex(x => x.id === f.id)
    const isiFolder = anakFolder(f.id).length
    const isiPaket = anakPaket(f.id).length
    return (
      <div className="paket-row">
        <div className="urutan-col">
          <button onClick={() => pindahUrutanFolder(f, -1)} disabled={idx === 0}>▲</button>
          <button onClick={() => pindahUrutanFolder(f, 1)} disabled={idx === siblings.length - 1}>▼</button>
        </div>
        <div className="info" onClick={() => setCurrentFolderId(f.id)}>
          <div className="nama"><span>📁 {f.nama}</span></div>
          <div className="meta">
            <span>{isiFolder > 0 ? `${isiFolder} folder, ` : ''}{isiPaket} paket</span>
          </div>
        </div>
        <button className="icon-btn" title="Pindahkan ke folder lain" onClick={() => setMovePicker({ type: 'folder', item: f })}>➜</button>
        <button className="icon-btn" title="Rename folder" onClick={() => renameFolder(f)}>✏️</button>
        <button className="icon-btn danger" title="Hapus folder" onClick={() => hapusFolder(f)}>✕</button>
      </div>
    )
  }

  function RowPaket({ p, siblings, allowReorder = true }) {
    const idx = siblings.findIndex(x => x.id === p.id)
    return (
      <div className="paket-row">
        <div className="urutan-col">
          {allowReorder && (
            <>
              <button onClick={() => pindahDalamFolder(p, -1)} disabled={idx === 0}>▲</button>
              <button onClick={() => pindahDalamFolder(p, 1)} disabled={idx === siblings.length - 1}>▼</button>
            </>
          )}
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
        <button className="icon-btn" title="Pindahkan ke folder lain" onClick={() => setMovePicker({ type: 'paket', item: p })}>➜</button>
        <button className="icon-btn" title="Ubah nama" onClick={() => editPaket(p)}>✏️</button>
        <button className="icon-btn danger" title="Hapus paket" onClick={() => hapusPaket(p)}>✕</button>
      </div>
    )
  }

  function Breadcrumb() {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', fontSize: 12, margin: '2px 0 12px', color: 'var(--muted)' }}>
        <span
          style={{ cursor: 'pointer', fontWeight: currentFolderId === null ? 700 : 500, color: currentFolderId === null ? 'var(--accent)' : 'var(--muted)' }}
          onClick={() => setCurrentFolderId(null)}
        >🏠 Beranda</span>
        {jejak.map(f => (
          <span key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>/</span>
            <span
              style={{ cursor: 'pointer', fontWeight: f.id === currentFolderId ? 700 : 500, color: f.id === currentFolderId ? 'var(--accent)' : 'var(--muted)' }}
              onClick={() => setCurrentFolderId(f.id)}
            >{f.nama}</span>
          </span>
        ))}
      </div>
    )
  }

  function MovePickerModal() {
    if (!movePicker) return null
    const { type, item } = movePicker
    const excluded = type === 'folder' ? idFolderTurunan(item.id) : new Set()

    function renderNode(parentId, depth) {
      return anakFolder(parentId).filter(f => !excluded.has(f.id)).map(f => (
        <div key={f.id}>
          <button
            className="act-btn"
            style={{ display: 'block', width: '100%', textAlign: 'left', marginLeft: depth * 14, marginBottom: 4 }}
            onClick={() => type === 'folder' ? pindahFolderKe(item, f.id) : pindahPaketKe(item, f.id)}
          >📁 {f.nama}</button>
          {renderNode(f.id, depth + 1)}
        </div>
      ))
    }

    return (
      <div
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        onClick={() => setMovePicker(null)}
      >
        <div
          style={{ background: '#fff', borderRadius: 14, padding: 18, width: 320, maxWidth: '100%', maxHeight: '70vh', overflowY: 'auto' }}
          onClick={e => e.stopPropagation()}
        >
          <div style={{ fontWeight: 700, marginBottom: 10, color: 'var(--accent)', fontSize: 14 }}>
            Pindahkan "{item.nama}" ke:
          </div>
          <button
            className="act-btn"
            style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 6 }}
            onClick={() => type === 'folder' ? pindahFolderKe(item, null) : pindahPaketKe(item, null)}
          >🏠 Beranda (root)</button>
          {renderNode(null, 0)}
          <button className="btn-dashed" style={{ marginTop: 10 }} onClick={() => setMovePicker(null)}>Batal</button>
        </div>
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

        {!loading && !term && (
          <>
            <Breadcrumb />

            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button className="btn-dashed" style={{ flex: 1 }} onClick={tambahFolder}>＋ Folder baru</button>
              <button className="btn-dashed" style={{ flex: 1 }} onClick={tambahPaketDiFolder}>＋ Paket baru</button>
            </div>

            {subfolderIni.length === 0 && paketIni.length === 0 && (
              <div style={{ textAlign: 'center', color: '#9abaa8', fontSize: 12, padding: '20px 0' }}>
                Folder ini masih kosong.
              </div>
            )}

            {subfolderIni.map(f => <RowFolder key={f.id} f={f} siblings={subfolderIni} />)}
            {paketIni.map(p => <RowPaket key={p.id} p={p} siblings={paketIni} />)}
          </>
        )}

        {!loading && term && hasilSearch && (
          <>
            <div style={{ fontSize: 11, color: '#9abaa8', margin: '6px 0' }}>{hasilSearch.length} paket ditemukan</div>
            {hasilSearch.map(p => (
              <RowPaket key={p.id} p={p} siblings={[]} allowReorder={false} />
            ))}
          </>
        )}

        {!loading && folders.length === 0 && paketList.length === 0 && (
          <div style={{ textAlign: 'center', color: '#9abaa8', fontSize: 12, padding: '20px 0' }}>
            Belum ada apa-apa. Bikin folder atau paket pertama!
          </div>
        )}
      </div>
      <MovePickerModal />
    </div>
  )
}
