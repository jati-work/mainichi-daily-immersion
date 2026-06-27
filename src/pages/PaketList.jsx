import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'

export default function PaketList({ goTo, openPaket, userId }) {
  const [paketList, setPaketList] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [collapsedGroups, setCollapsedGroups] = useState(new Set())
  const [initedCollapse, setInitedCollapse] = useState(false)

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

  async function tambahPaket() {
    const nama = prompt('Nama paket baru (contoh: Anime XYZ Eps 1):')
    if (!nama || !nama.trim()) return
    const tanggal = prompt('Tanggal/bulan paket ini (contoh: Januari 2026) — boleh dikosongin:', '')
    const urutanMax = paketList.length > 0 ? Math.max(...paketList.map(p => p.urutan)) + 1 : 0
    const { error } = await supabase.from('paket').insert({
      nama: nama.trim(), tanggal: tanggal ? tanggal.trim() : '', urutan: urutanMax, user_id: userId,
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
          <div>
            <div className="cover-title" style={{ fontSize: 22 }}>Kosakata Immersion</div>
            <div className="cover-sub">kosakata dari keseharian</div>
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
