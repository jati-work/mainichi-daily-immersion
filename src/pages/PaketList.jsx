import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'

export default function PaketList({ goTo, openPaket }) {
  const [folders, setFolders] = useState([])
  const [paketList, setPaketList] = useState([])
  const [folderKiri, setFolderKiri] = useState(null)   // currentFolderId panel BUKU (null = root panel kiri)
  const [folderKanan, setFolderKanan] = useState(null) // currentFolderId panel HARIAN (null = root panel kanan)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [exportLoading, setExportLoading] = useState(false)
  const [movePicker, setMovePicker] = useState(null) // { type: 'folder'|'paket', item }
  const [kamusHasil, setKamusHasil] = useState([])
  const [kamusLoading, setKamusLoading] = useState(false)
  const [tambahMenuSisi, setTambahMenuSisi] = useState(null) // 'kiri' | 'kanan' | null

  useEffect(() => {
    function handleClickOutside(e) {
      if (!e.target.closest('[data-tambah-menu]')) setTambahMenuSisi(null)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function muatData() {
    setLoading(true)
    const [{ data: fData, error: fErr }, { data: pData, error: pErr }] = await Promise.all([
      supabase.from('folders').select('id, nama, parent_id, urutan, kolom').order('urutan', { ascending: true }),
      supabase
        .from('paket')
        .select('id, nama, folder_id, urutan_dalam_grup, pdf_path, kolom, kata(count), diary_pages(isi_teks)')
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

  // ----- kamus: cari kata (kanji/kana atau arti) di semua paket -----
  useEffect(() => {
    const term = search.trim()
    if (!term) { setKamusHasil([]); setKamusLoading(false); return }
    setKamusLoading(true)
    const timer = setTimeout(async () => {
      const { data, error } = await supabase
        .from('kata')
        .select('id, jp, arti, paket:paket_id (id, nama)')
        .or(`jp.ilike.%${term}%,arti.ilike.%${term}%`)
        .limit(50)
      if (!error) setKamusHasil(data || [])
      setKamusLoading(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  // ---------- helper: struktur folder (sadar sisi kiri/kanan) ----------
  // di level ROOT (parentId null), kefilter sesuai kolom (kiri=buku, kanan=harian).
  // begitu udah masuk ke dalem sub-folder, kolom nggak dipake lagi -- soalnya
  // struktur folder itu tree biasa, jadi begitu "masuk" ke sisi tertentu,
  // semua anak-cucunya otomatis ikut sisi itu (nggak ada folder yang nyambung
  // ke 2 sisi sekaligus).
  function anakFolder(parentId, sisi) {
    return folders
      .filter(f => parentId === null ? (f.parent_id === null && (f.kolom || 'kiri') === sisi) : f.parent_id === parentId)
      .sort((a, b) => a.urutan - b.urutan)
  }
  function anakPaket(folderId, sisi) {
    return paketList
      .filter(p => folderId === null ? (p.folder_id === null && (p.kolom || 'kiri') === sisi) : p.folder_id === folderId)
      .sort((a, b) => (a.urutan_dalam_grup ?? 0) - (b.urutan_dalam_grup ?? 0))
  }
  function jejakBreadcrumb(id) {
    const path = []
    let cur = folders.find(f => f.id === id)
    while (cur) { path.unshift(cur); cur = folders.find(f => f.id === cur.parent_id) }
    return path
  }
  // nentuin sisi (kiri/kanan) suatu folder/paket, dengan naik ke folder root
  // leluhurnya kalau dia nempel di dalem sub-folder
  function sisiItem(item) {
    const parentId = item.tipe === 'folder' ? item.data.parent_id : item.data.folder_id
    if (parentId === null) return item.data.kolom || 'kiri'
    let cur = folders.find(f => f.id === parentId)
    while (cur && cur.parent_id) cur = folders.find(f => f.id === cur.parent_id)
    return cur?.kolom || 'kiri'
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
  async function tambahFolder(sisi, currentId) {
    const nama = prompt('Nama folder baru:')
    if (!nama || !nama.trim()) return
    const siblings = [...anakFolder(currentId, sisi).map(f => f.urutan ?? 0), ...anakPaket(currentId, sisi).map(p => p.urutan_dalam_grup ?? 0)]
    const urutan = siblings.length ? Math.max(...siblings) + 1 : 0
    const payload = { nama: nama.trim(), parent_id: currentId, urutan }
    if (currentId === null) payload.kolom = sisi
    const { error } = await supabase.from('folders').insert(payload)
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
    if (folderKiri && idTurunan.includes(folderKiri)) setFolderKiri(f.parent_id ?? null)
    if (folderKanan && idTurunan.includes(folderKanan)) setFolderKanan(f.parent_id ?? null)
    muatData()
  }

  async function pindahFolderKe(f, targetParentId) {
    if (f.id === targetParentId) return
    if (idFolderTurunan(f.id).has(targetParentId)) { alert('Gak bisa pindahin folder ke dalam dirinya sendiri / anaknya sendiri.'); return }
    const sisi = sisiItem({ tipe: 'folder', data: f })
    const siblings = anakFolder(targetParentId, sisi).filter(x => x.id !== f.id)
    const urutan = siblings.length ? Math.max(...siblings.map(x => x.urutan)) + 1 : 0
    const payload = { parent_id: targetParentId, urutan }
    if (targetParentId === null) payload.kolom = sisi
    const { error } = await supabase.from('folders').update(payload).eq('id', f.id)
    if (error) alert('Gagal pindah: ' + error.message)
    else { setMovePicker(null); muatData() }
  }

  // gabungan folder + paket dalam satu folder, diurutin bareng biar bisa
  // digeser naik-turun lintas tipe (paket bisa naik ngelewatin folder, dst)
  function itemsGabungan(folderId, sisi) {
    const gab = [
      ...anakFolder(folderId, sisi).map(f => ({ tipe: 'folder', data: f, urutan: f.urutan ?? 0 })),
      ...anakPaket(folderId, sisi).map(p => ({ tipe: 'paket', data: p, urutan: p.urutan_dalam_grup ?? 0 })),
    ]
    return gab.sort((a, b) => a.urutan - b.urutan)
  }

  async function pindahUrutanGabungan(item, dir, sisi) {
    const parentId = item.tipe === 'folder' ? item.data.parent_id : item.data.folder_id
    const items = itemsGabungan(parentId, sisi)
    const idx = items.findIndex(x => x.tipe === item.tipe && x.data.id === item.data.id)
    const target = items[idx + dir]
    if (!target) return
    const tabelItem = item.tipe === 'folder' ? 'folders' : 'paket'
    const kolomItem = item.tipe === 'folder' ? 'urutan' : 'urutan_dalam_grup'
    const tabelTarget = target.tipe === 'folder' ? 'folders' : 'paket'
    const kolomTarget = target.tipe === 'folder' ? 'urutan' : 'urutan_dalam_grup'
    await supabase.from(tabelItem).update({ [kolomItem]: target.urutan }).eq('id', item.data.id)
    await supabase.from(tabelTarget).update({ [kolomTarget]: item.urutan }).eq('id', target.data.id)
    muatData()
  }

  // ---------- aksi paket ----------
  async function tambahPaketDiFolder(sisi, currentId) {
    const nama = prompt('Nama paket baru (contoh: N3 Mojigoi - Kanji Yomi):')
    if (!nama || !nama.trim()) return
    const siblings = [...anakFolder(currentId, sisi).map(f => f.urutan ?? 0), ...anakPaket(currentId, sisi).map(p => p.urutan_dalam_grup ?? 0)]
    const urutan = siblings.length ? Math.max(...siblings) + 1 : 0
    const payload = { nama: nama.trim(), folder_id: currentId, urutan_dalam_grup: urutan, urutan }
    if (currentId === null) payload.kolom = sisi
    const { error } = await supabase.from('paket').insert(payload)
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

  async function pindahPaketKe(p, targetFolderId) {
    const sisi = sisiItem({ tipe: 'paket', data: p })
    const siblings = anakPaket(targetFolderId, sisi).filter(x => x.id !== p.id)
    const urutan = siblings.length ? Math.max(...siblings.map(x => x.urutan_dalam_grup ?? 0)) + 1 : 0
    const payload = { folder_id: targetFolderId, urutan_dalam_grup: urutan }
    if (targetFolderId === null) payload.kolom = sisi
    const { error } = await supabase.from('paket').update(payload).eq('id', p.id)
    if (error) alert('Gagal pindah: ' + error.message)
    else { setMovePicker(null); muatData() }
  }

  // ---------- kiri/kanan (ditentuin pas bikin folder/paket baru di panel yang sesuai) ----------

  const term = search.trim()
  const namaPaketDitemukan = useMemo(() => {
    const set = new Set(kamusHasil.map(k => k.paket?.nama).filter(Boolean))
    return [...set]
  }, [kamusHasil])

  // data per panel, dihitung ulang tiap folders/paketList/folderKiri/folderKanan berubah
  const subfolderKiri = useMemo(() => anakFolder(folderKiri, 'kiri'), [folders, folderKiri])
  const paketKiri = useMemo(() => anakPaket(folderKiri, 'kiri'), [paketList, folderKiri])
  const itemsKiri = useMemo(() => itemsGabungan(folderKiri, 'kiri'), [subfolderKiri, paketKiri])
  const jejakKiri = useMemo(() => jejakBreadcrumb(folderKiri), [folders, folderKiri])

  const subfolderKanan = useMemo(() => anakFolder(folderKanan, 'kanan'), [folders, folderKanan])
  const paketKanan = useMemo(() => anakPaket(folderKanan, 'kanan'), [paketList, folderKanan])
  const itemsKanan = useMemo(() => itemsGabungan(folderKanan, 'kanan'), [subfolderKanan, paketKanan])
  const jejakKanan = useMemo(() => jejakBreadcrumb(folderKanan), [folders, folderKanan])

  function RowFolder({ f, idx, itemsLen, sisi, onOpen }) {
    const isiFolder = anakFolder(f.id, sisi).length
    const isiPaket = anakPaket(f.id, sisi).length
    return (
      <div className="paket-row">
        <div className="urutan-col">
          <button onClick={() => pindahUrutanGabungan({ tipe: 'folder', data: f, urutan: f.urutan ?? 0 }, -1, sisi)} disabled={idx === 0}>▲</button>
          <button onClick={() => pindahUrutanGabungan({ tipe: 'folder', data: f, urutan: f.urutan ?? 0 }, 1, sisi)} disabled={idx === itemsLen - 1}>▼</button>
        </div>
        <div className="info" onClick={onOpen}>
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

  function RowPaket({ p, idx, itemsLen, sisi, allowReorder = true }) {
    return (
      <div className="paket-row">
        <div className="urutan-col">
          {allowReorder && (
            <>
              <button onClick={() => pindahUrutanGabungan({ tipe: 'paket', data: p, urutan: p.urutan_dalam_grup ?? 0 }, -1, sisi)} disabled={idx === 0}>▲</button>
              <button onClick={() => pindahUrutanGabungan({ tipe: 'paket', data: p, urutan: p.urutan_dalam_grup ?? 0 }, 1, sisi)} disabled={idx === itemsLen - 1}>▼</button>
            </>
          )}
        </div>
        <div className="info" onClick={() => openPaket(p.id)}>
          <div className="nama">
            <span>{p.nama}</span>
            {p.pdf_path && <span title="Ada PDF">📄</span>}
            {p.adaIsiDiary && <span title="Ada catatan diary">📔</span>}
          </div>
        </div>
        <button className="icon-btn" title="Pindahkan ke folder lain" onClick={() => setMovePicker({ type: 'paket', item: p })}>➜</button>
        <button className="icon-btn" title="Ubah nama" onClick={() => editPaket(p)}>✏️</button>
        <button className="icon-btn danger" title="Hapus paket" onClick={() => hapusPaket(p)}>✕</button>
      </div>
    )
  }

  function Breadcrumb({ currentId, jejak, onNavigate }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', fontSize: 13, fontWeight: 500, color: 'var(--muted)' }}>
        <span
          style={{ cursor: 'pointer', fontWeight: currentId === null ? 700 : 500, color: currentId === null ? 'var(--accent)' : 'var(--muted)' }}
          onClick={() => onNavigate(null)}
        >🏠 Beranda</span>
        {jejak.map(f => (
          <span key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>/</span>
            <span
              style={{ cursor: 'pointer', fontWeight: f.id === currentId ? 700 : 500, color: f.id === currentId ? 'var(--accent)' : 'var(--muted)' }}
              onClick={() => onNavigate(f.id)}
            >{f.nama}</span>
          </span>
        ))}
      </div>
    )
  }

  function MovePickerModal() {
    if (!movePicker) return null
    const { type, item } = movePicker
    const sisi = sisiItem({ tipe: type, data: item })
    const excluded = type === 'folder' ? idFolderTurunan(item.id) : new Set()

    function renderNode(parentId, depth) {
      return anakFolder(parentId, sisi).filter(f => !excluded.has(f.id)).map(f => (
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
            Pindahkan "{item.nama}" ke: <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(sisi {sisi === 'kiri' ? 'Buku' : 'Harian'})</span>
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

  function PanelSisi({ sisi, label, currentId, setCurrentId, subfolder, paket, items, jejak }) {
    return (
      <div style={{ flex: 1, minWidth: 0, padding: sisi === 'kiri' ? '0 24px 0 0' : '0 0 0 24px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#7aaa8a', marginBottom: 8 }}>{label}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <Breadcrumb currentId={currentId} jejak={jejak} onNavigate={setCurrentId} />
          <div style={{ position: 'relative' }} data-tambah-menu>
            <button
              className="icon-btn" title="Tambah folder atau paket"
              onClick={() => setTambahMenuSisi(s => s === sisi ? null : sisi)}
              style={{ width: 34, height: 34, fontSize: 18, fontWeight: 700 }}
            >⋯</button>
            {tambahMenuSisi === sisi && (
              <div
                style={{
                  position: 'absolute', top: '110%', right: 0, background: '#fff', borderRadius: 10,
                  boxShadow: '0 6px 18px rgba(0,0,0,.15)', border: '1px solid #e5e5e5',
                  minWidth: 170, zIndex: 20, overflow: 'hidden',
                }}
              >
                <button
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                    padding: '10px 14px', border: 'none', background: '#fff', cursor: 'pointer', fontSize: 13,
                  }}
                  onClick={() => { setTambahMenuSisi(null); tambahFolder(sisi, currentId) }}
                >📁 Folder baru</button>
                <button
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                    padding: '10px 14px', border: 'none', borderTop: '1px solid #f0f0f0', background: '#fff', cursor: 'pointer', fontSize: 13,
                  }}
                  onClick={() => { setTambahMenuSisi(null); tambahPaketDiFolder(sisi, currentId) }}
                >📚 Paket baru</button>
              </div>
            )}
          </div>
        </div>

        {subfolder.length === 0 && paket.length === 0 && (
          <div style={{ textAlign: 'center', color: '#9abaa8', fontSize: 12, padding: '20px 0' }}>
            {currentId === null ? 'Belum ada apa-apa di sini.' : 'Folder ini masih kosong.'}
          </div>
        )}

        {items.map((item, idx) =>
          item.tipe === 'folder'
            ? <RowFolder key={item.data.id} f={item.data} idx={idx} itemsLen={items.length} sisi={sisi} onOpen={() => setCurrentId(item.data.id)} />
            : <RowPaket key={item.data.id} p={item.data} idx={idx} itemsLen={items.length} sisi={sisi} />
        )}
      </div>
    )
  }

  return (
    <div className="cover" style={{ justifyContent: 'flex-start', paddingTop: 60 }}>
      <button className="back-fab" onClick={() => goTo('cover')}>←</button>
      <div className="cover-inner paket-list-wide">
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
          className="input-search" placeholder="🔍 Cari kata (kanji/kana atau artinya)..."
          value={search} onChange={e => setSearch(e.target.value)}
        />

        {loading && <div style={{ textAlign: 'center', color: '#9abaa8', padding: 20 }}>Memuat...</div>}

        {!loading && !term && (
          <div style={{ display: 'flex', gap: 0, alignItems: 'flex-start' }} className="panel-dua-sisi">
            <PanelSisi
              sisi="kiri" label="📚 Buku" currentId={folderKiri} setCurrentId={setFolderKiri}
              subfolder={subfolderKiri} paket={paketKiri} items={itemsKiri} jejak={jejakKiri}
            />
            <div className="panel-divider" />
            <PanelSisi
              sisi="kanan" label="🎬 Harian" currentId={folderKanan} setCurrentId={setFolderKanan}
              subfolder={subfolderKanan} paket={paketKanan} items={itemsKanan} jejak={jejakKanan}
            />
          </div>
        )}

        {!loading && term && (
          <>
            {kamusLoading && <div style={{ textAlign: 'center', color: '#9abaa8', padding: 20 }}>Mencari...</div>}

            {!kamusLoading && (
              <>
                {namaPaketDitemukan.length > 0 && (
                  <div style={{ fontSize: 11, color: '#7aaa8a', margin: '6px 0 14px', lineHeight: 1.6 }}>
                    Ditemukan di: <b>{namaPaketDitemukan.join(', ')}</b>
                  </div>
                )}

                {kamusHasil.length === 0 && (
                  <div style={{ textAlign: 'center', color: '#9abaa8', fontSize: 12, padding: '20px 0' }}>
                    Gak ketemu kata "{search}"
                  </div>
                )}

                {kamusHasil.map(k => (
                  <div
                    key={k.id} className="paket-row" style={{ cursor: k.paket ? 'pointer' : 'default' }}
                    onClick={() => k.paket && openPaket(k.paket.id)}
                  >
                    <div className="info">
                      <div className="nama">
                        <span style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 16 }}>{k.jp}</span>
                      </div>
                      <div className="meta">
                        <span>{k.arti}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
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
