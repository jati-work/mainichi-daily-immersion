import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { loadXLSX, loadExcelJS } from '../lib/excelLoaders'
import { NAMA_KATEGORI } from '../data/radikalData'

const kunciHeader = h => String(h ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
const ALIAS = {
  kategori: ['kategori'], karakter: ['karakter', 'char', 'radikal'], arti: ['arti', 'meaning'],
  menemonik: ['menemonik', 'mnemonic', 'catatan'], id: ['id'], hafal: ['hafal', 'sudahhafal'],
}
const nilaiYa = v => ['ya', 'yes', 'true', '1', 'v', '✓', 'sudah'].includes(String(v).trim().toLowerCase())
const kunciSama = (k, kt, a) => `${String(k).trim()}|${String(kt).trim().toLowerCase()}|${String(a).trim().toLowerCase()}`

function bacaSheet(XLSX, ws) {
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' })
  const barisHeader = aoa.findIndex(r => r.some(c => String(c).trim() !== ''))
  if (barisHeader === -1) return { kosong: true, baris: [] }
  const peta = {}
  aoa[barisHeader].forEach((h, i) => {
    const k = kunciHeader(h)
    Object.entries(ALIAS).forEach(([field, alias]) => { if (peta[field] === undefined && alias.includes(k)) peta[field] = i })
  })
  const wajib = ['kategori', 'karakter', 'arti'].filter(f => peta[f] === undefined)
  if (wajib.length) return { error: `Kolom ${wajib.join(', ')} nggak ketemu di baris pertama`, baris: [] }
  const baris = []
  aoa.slice(barisHeader + 1).forEach((r, i) => {
    if (r.every(c => String(c).trim() === '')) return
    const g = f => peta[f] !== undefined ? String(r[peta[f]] ?? '').trim() : ''
    baris.push({
      _no: barisHeader + i + 2, kategori: g('kategori'), karakter: g('karakter'), arti: g('arti'),
      menemonik: g('menemonik'), id: g('id'), hafal: peta.hafal !== undefined ? nilaiYa(r[peta.hafal]) : undefined,
    })
  })
  return { baris }
}

function klasifikasi(baris, radikalList) {
  const idAda = new Set(radikalList.map(r => r.id))
  const existingKey = new Set(radikalList.map(r => kunciSama(r.karakter, r.kategori, r.arti)))
  const hasil = { ok: [], lengkap: [], dobel: [], update: [] }
  const sudahDiFile = new Set()
  baris.forEach(b => {
    if (!b.kategori || !b.karakter || !b.arti) { hasil.lengkap.push(b); return }
    if (b.id && idAda.has(b.id)) { hasil.update.push(b); return }
    const key = kunciSama(b.karakter, b.kategori, b.arti)
    if (existingKey.has(key) || sudahDiFile.has(key)) { hasil.dobel.push(b); return }
    sudahDiFile.add(key)
    hasil.ok.push(b)
  })
  return hasil
}

export default function ImportExcelRadikal({ radikalList, onDone }) {
  const [menu, setMenu] = useState(false)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(null)
  const inputRef = useRef(null)
  const wrapRef = useRef(null)

  useEffect(() => {
    const h = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setMenu(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  async function downloadTemplate() {
    setMenu(false)
    setBusy(true)
    try {
      const ExcelJS = await loadExcelJS()
      const wb = new ExcelJS.Workbook()
      const ws = wb.addWorksheet('Radikal')
      const kolom = [
        { judul: 'Kategori', wajib: true, wch: 24 }, { judul: 'Karakter', wajib: true, wch: 14 },
        { judul: 'Arti', wajib: true, wch: 24 }, { judul: 'Menemonik', wajib: false, wch: 30 },
      ]
      ws.columns = kolom.map(c => ({ header: c.judul, width: c.wch }))
      ws.getRow(1).eachCell((cell, i) => {
        cell.font = { bold: true, color: { argb: kolom[i - 1].wajib ? 'FFFFFFFF' : 'FF2D6A4A' } }
        if (kolom[i - 1].wajib) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3E7CB1' } }
      })
      ws.getRow(1).height = 20

      const wsP = wb.addWorksheet('Petunjuk')
      wsP.columns = [{ width: 95 }]
      ;[
        'Petunjuk import radikal', '',
        'Wajib diisi (header biru): Kategori, Karakter, Arti. Menemonik (header hijau) opsional.',
        `Kategori yang udah ada: ${NAMA_KATEGORI.join(', ')}. Boleh juga pakai nama kategori baru, nanti otomatis dibikin.`,
        'Radikal yang karakter+kategori+arti-nya SAMA PERSIS sama yang udah ada bakal dilewati (dianggap dobel).',
        'Jangan ubah nama kolom di baris pertama. Sheet "Petunjuk" nggak ikut diimpor.',
      ].forEach(t => wsP.addRow([t]))
      wsP.getRow(1).font = { bold: true, size: 13, color: { argb: 'FF2D6A4A' } }

      const buf = await wb.xlsx.writeBuffer()
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = 'template-import-radikal.xlsx'; a.click()
      URL.revokeObjectURL(url)
    } catch (e) { alert('Gagal bikin template: ' + e.message) }
    setBusy(false)
  }

  async function exportSemua() {
    setMenu(false)
    if (!radikalList || radikalList.length === 0) { alert('Belum ada radikal buat di-export.'); return }
    setBusy(true)
    try {
      const ExcelJS = await loadExcelJS()
      const wb = new ExcelJS.Workbook()
      const ws = wb.addWorksheet('Radikal')
      ws.columns = [
        { header: 'ID', width: 10 }, { header: 'Kategori', width: 24 }, { header: 'Karakter', width: 14 },
        { header: 'Arti', width: 24 }, { header: 'Menemonik', width: 30 }, { header: 'Hafal', width: 10 },
      ]
      ws.getRow(1).font = { bold: true, color: { argb: 'FF2D6A4A' } }
      ws.getColumn(1).font = { color: { argb: 'FFB8C8B8' }, italic: true }
      ;[...radikalList].sort((a, b) => a.kategori.localeCompare(b.kategori)).forEach(r => {
        ws.addRow([r.id, r.kategori, r.karakter, r.arti, r.menemonik || '', r.hafal ? 'Ya' : ''])
      })

      const wsP = wb.addWorksheet('Petunjuk')
      wsP.columns = [{ width: 100 }]
      ;[
        'Petunjuk export radikal', '',
        `Isi: SEMUA radikal (${radikalList.length} total), hafal maupun belum.`,
        'Boleh diedit bebas buat ngebenerin typo, isi menemonik, dsb.',
        'Kolom ID JANGAN diubah/dihapus -- itu yang bikin baris ini ke-detect sebagai radikal YANG SAMA pas di-upload balik, jadi hasilnya UPDATE bukan nambah dobel.',
        'Mau nambah radikal baru? Tambah baris baru di bawah, kosongin aja kolom ID-nya.',
        'Kolom Hafal: isi "Ya" kalau udah hafal, kosongin kalau belum.',
        'Upload balik lewat tombol yang sama > "Pilih file Excel".',
      ].forEach(t => wsP.addRow([t]))
      wsP.getRow(1).font = { bold: true, size: 13, color: { argb: 'FF2D6A4A' } }

      const buf = await wb.xlsx.writeBuffer()
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `radikal-${new Date().toISOString().slice(0, 10)}.xlsx`; a.click()
      URL.revokeObjectURL(url)
    } catch (e) { alert('Gagal export: ' + e.message) }
    setBusy(false)
  }

  async function pilihFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    try {
      const XLSX = await loadXLSX()
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
      const namaSheet = wb.SheetNames.find(n => n.trim().toLowerCase() !== 'petunjuk')
      if (!namaSheet) { alert('Nggak ada sheet yang bisa dibaca.'); setBusy(false); return }
      const r = bacaSheet(XLSX, wb.Sheets[namaSheet])
      if (r.error) { alert(r.error); setBusy(false); return }
      if (r.kosong || r.baris.length === 0) { alert('Sheet-nya kosong.'); setBusy(false); return }

      const pesanKurang = r.baris.filter(b => !b.id).reduce((acc, b) => {
        if (!b.kategori || !b.karakter || !b.arti) {
          const hilang = [!b.kategori && 'Kategori', !b.karakter && 'Karakter', !b.arti && 'Arti'].filter(Boolean).join(' & ')
          acc.push(`baris ${b._no}: ${hilang} kosong`)
        }
        return acc
      }, [])
      if (pesanKurang.length > 0) {
        alert(`Maaf, ada ${pesanKurang.length} baris yang belum lengkap. Kategori, Karakter, dan Arti wajib diisi:\n\n` +
          pesanKurang.slice(0, 15).join('\n') + (pesanKurang.length > 15 ? `\n…dan ${pesanKurang.length - 15} baris lainnya` : '') +
          '\n\nLengkapi dulu di Excel-nya, lalu upload ulang.')
        setBusy(false); return
      }

      setPreview({ namaFile: file.name, ...klasifikasi(r.baris, radikalList) })
    } catch (err) {
      alert('Gagal baca file Excel: ' + (err.message || err))
    }
    setBusy(false)
  }

  async function jalankan() {
    setBusy(true)
    let jumlahUpdate = 0, jumlahBaru = 0
    try {
      for (const u of preview.update) {
        const payload = { kategori: u.kategori, karakter: u.karakter, arti: u.arti, menemonik: u.menemonik }
        if (u.hafal !== undefined) payload.hafal = u.hafal
        const { error } = await supabase.from('radikal').update(payload).eq('id', u.id)
        if (error) throw new Error(`Gagal update radikal (ID ${u.id}): ${error.message}`)
        jumlahUpdate++
      }
      if (preview.ok.length > 0) {
        const payload = preview.ok.map(b => ({
          kategori: b.kategori, karakter: b.karakter, arti: b.arti, menemonik: b.menemonik,
          ...(b.hafal !== undefined ? { hafal: b.hafal } : {}),
        }))
        for (let i = 0; i < payload.length; i += 200) {
          const { error } = await supabase.from('radikal').insert(payload.slice(i, i + 200))
          if (error) throw new Error('Gagal simpan radikal: ' + error.message)
        }
        jumlahBaru = preview.ok.length
      }
      setPreview(null)
      alert(`Selesai! ${[jumlahUpdate > 0 && `${jumlahUpdate} di-update`, jumlahBaru > 0 && `${jumlahBaru} baru masuk`].filter(Boolean).join(', ') || 'Nggak ada perubahan.'}`)
    } catch (err) { alert(err.message) }
    setBusy(false)
    onDone?.()
  }

  const totalMasuk = preview ? preview.ok.length + preview.update.length : 0
  const kecil = { fontSize: 11, color: '#7a8a80', lineHeight: 1.6 }

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button className="act-btn" title="Excel: import, export, atau download template" disabled={busy} onClick={() => setMenu(m => !m)} style={{ fontWeight: 700 }}>
        {busy && !preview ? '⏳' : '🔃'}
      </button>
      <input ref={inputRef} type="file" accept=".xlsx,.xls" onChange={pilihFile} style={{ display: 'none' }} />
      {menu && (
        <div style={{ position: 'absolute', top: '110%', right: 0, background: '#fff', borderRadius: 10, boxShadow: '0 6px 18px rgba(0,0,0,.15)', border: '1px solid #e5e5e5', minWidth: 230, zIndex: 20, overflow: 'hidden' }}>
          <button style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', background: '#fff', cursor: 'pointer', fontSize: 13 }}
            onClick={() => { setMenu(false); inputRef.current?.click() }}>📥 Pilih file Excel (import/update)</button>
          <button style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', borderTop: '1px solid #f0f0f0', background: '#fff', cursor: 'pointer', fontSize: 13 }}
            onClick={exportSemua}>📤 Export semua radikal ({radikalList?.length || 0})</button>
          <button style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', borderTop: '1px solid #f0f0f0', background: '#fff', cursor: 'pointer', fontSize: 13 }}
            onClick={downloadTemplate}>📄 Download template kosong</button>
        </div>
      )}

      {preview && (
        <div className="modal-overlay open">
          <div className="modal-box" style={{ maxWidth: 420, maxHeight: '85vh', overflowY: 'auto', textAlign: 'left' }}>
            <div className="modal-title" style={{ textAlign: 'center' }}>Import Radikal</div>
            <div style={{ ...kecil, textAlign: 'center', marginBottom: 10 }}>{preview.namaFile}</div>

            <div style={{ fontSize: 12, marginBottom: 8 }}>
              {preview.update.length > 0 && `🔄 ${preview.update.length} di-update · `}
              ✅ {preview.ok.length} baru masuk
              {preview.dobel.length > 0 && ` · ⏭ ${preview.dobel.length} dilewati (udah ada persis sama)`}
            </div>
            {preview.dobel.slice(0, 6).map((b, i) => (
              <div key={i} style={kecil}>
                <span style={{ fontFamily: "'Noto Serif JP', serif" }}>{b.karakter}</span> ({b.kategori}) — udah ada persis, baris {b._no}
              </div>
            ))}
            {preview.dobel.length > 6 && <div style={kecil}>…dan {preview.dobel.length - 6} lainnya</div>}

            <div className="modal-btns" style={{ marginTop: 12 }}>
              <button disabled={busy} onClick={() => setPreview(null)}>Batal</button>
              <button className="confirm" disabled={busy || totalMasuk === 0} onClick={jalankan}>
                {busy ? 'Memproses...' : preview.update.length > 0
                  ? `Proses (${preview.update.length} update, ${preview.ok.length} baru)`
                  : `Import ${totalMasuk} radikal`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
