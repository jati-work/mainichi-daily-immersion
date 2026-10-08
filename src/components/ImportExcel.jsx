import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { loadXLSX, loadExcelJS } from '../lib/excelLoaders'

// ---------- konfigurasi kolom per sisi ----------
// kiri = Buku (kata + bunshuu), kanan = Harian (kalimat + konteks + nuansa)
const KOLOM = {
  kiri: [
    { field: 'jp', judul: 'Kata JP', wajib: true, alias: ['jp', 'kata', 'katajp', 'kanji', 'kanjidasar', 'katajpdasar'] },
    { field: 'arti', judul: 'Arti', wajib: true, alias: ['arti', 'artiid', 'artiindonesia', 'meaning', 'terjemahan'] },
    { field: 'contoh_kalimat', judul: 'Contoh Kalimat', alias: ['contohkalimat', 'contoh', 'kalimatcontoh'] },
    { field: 'bunshuu', judul: 'Bunshuu', alias: ['bunshuu', 'bushuu', 'bunshu', 'bushu', 'radikal', 'radical'] },
    { field: 'plesetan', judul: 'Plesetan Indo', alias: ['plesetan', 'plesetanindo', 'plesetanindonesia'] },
    { field: 'bagian', judul: 'Bagian', alias: ['bagian'] },
  ],
  kanan: [
    { field: 'jp', judul: 'Kalimat JP', wajib: true, alias: ['jp', 'kalimat', 'kalimatjp', 'kata', 'katajp', 'ekspresi'] },
    { field: 'arti', judul: 'Arti', wajib: true, alias: ['arti', 'artiid', 'artiindonesia', 'meaning', 'terjemahan'] },
    { field: 'kata_baru', judul: 'Kata Baru', alias: ['katabaru', 'katabarudipelajari'] },
    { field: 'konteks', judul: 'Konteks', alias: ['konteks', 'situasi'] },
    { field: 'nuansa', judul: 'Nuansa', alias: ['nuansa'] },
    { field: 'bagian', judul: 'Bagian', alias: ['bagian'] },
  ],
}
const SEMUA_FIELD = ['jp', 'arti', 'bagian', 'contoh_kalimat', 'bunshuu', 'plesetan', 'konteks', 'nuansa', 'kata_baru']
// id & hafal dibaca TERPISAH dari SEMUA_FIELD -- cuma relevan buat file hasil
// "Export semua kata" yang nanti di-upload ulang buat UPDATE, bukan buat
// template kosong (makanya nggak ikut nongol di KOLOM/template).
const ALIAS_ID = ['id']
const ALIAS_HAFAL = ['hafal', 'sudahhafal', 'statushafal']
const nilaiYa = v => ['ya', 'yes', 'true', '1', 'v', '✓', 'sudah'].includes(String(v).trim().toLowerCase())

// sama persis dengan normalisasiJP di PaketDetail.jsx
function normJP(s) {
  return String(s ?? '').trim().toLowerCase().replace(/[\s、。！？・「」]/g, '').normalize('NFKC')
}
const kunciHeader = h => String(h ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
const pecahTag = s => String(s || '').split(',').map(w => w.trim()).filter(Boolean)

// ambil SEMUA kata (Supabase default cuma ngembaliin 1000 baris per request)
async function ambilSemuaKata() {
  const semua = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('kata').select('id, jp, kata_baru, paket_id, paket:paket_id (nama, tanggal)').range(from, from + 999)
    if (error) throw error
    semua.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return semua
}

// ---------- baca 1 sheet -> baris terstruktur ----------
function bacaSheet(XLSX, ws, sisi) {
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' })
  const barisHeader = aoa.findIndex(r => r.some(c => String(c).trim() !== ''))
  if (barisHeader === -1) return { kosong: true, baris: [] }
  const peta = {} // field -> index kolom
  let kolomId, kolomHafal
  aoa[barisHeader].forEach((h, i) => {
    const k = kunciHeader(h)
    KOLOM[sisi].forEach(c => { if (peta[c.field] === undefined && c.alias.includes(k)) peta[c.field] = i })
    if (kolomId === undefined && ALIAS_ID.includes(k)) kolomId = i
    if (kolomHafal === undefined && ALIAS_HAFAL.includes(k)) kolomHafal = i
  })
  const hilang = KOLOM[sisi].filter(c => c.wajib && peta[c.field] === undefined).map(c => c.judul)
  if (hilang.length) return { error: `Kolom ${hilang.join(' & ')} nggak ketemu di baris pertama`, baris: [] }
  const baris = []
  aoa.slice(barisHeader + 1).forEach((r, i) => {
    if (r.every(c => String(c).trim() === '')) return
    const o = { _no: barisHeader + i + 2 }
    SEMUA_FIELD.forEach(f => { o[f] = peta[f] !== undefined ? String(r[peta[f]] ?? '').trim() : '' })
    o.id = kolomId !== undefined ? String(r[kolomId] ?? '').trim() : ''
    o.hafal = kolomHafal !== undefined ? nilaiYa(r[kolomHafal]) : undefined
    baris.push(o)
  })
  return { baris }
}

// ---------- klasifikasi: ok / lengkap-tidak / dobel / sudah ada ----------
// aturan sama kayak input manual di PaketDetail:
//  - Harian: kalimat persis sama = diblok total; kata_baru yang udah ada = peringatan (boleh dipaksa)
//  - Buku: kata yang udah ada = peringatan (boleh dipaksa)
function klasifikasi(baris, sisi, dbKata, sudahDiFile, idSaatIni) {
  const dbJp = new Map()   // normJP(jp) -> [info]
  const dbTag = new Map()  // normJP(tag kata_baru) -> [info]
  const tambah = (m, k, info) => { if (!k) return; if (!m.has(k)) m.set(k, []); m.get(k).push(info) }
  dbKata.forEach(r => {
    const info = { nama: r.paket?.nama, tanggal: r.paket?.tanggal }
    tambah(dbJp, normJP(r.jp), info)
    pecahTag(r.kata_baru).forEach(t => tambah(dbTag, normJP(t), info))
  })
  const hasil = { ok: [], lengkap: [], dobel: [], blok: [], warn: [], update: [] }
  baris.forEach(b => {
    if (!b.jp || !b.arti) { hasil.lengkap.push(b); return }
    // kalau kolom ID-nya cocok sama kata yang emang udah ada di paket ini,
    // ini mode UPDATE -- langsung dianggap sah, skip semua cek duplikat
    // (karena dia MEMANG baris kata itu sendiri, cuma lagi diedit).
    if (b.id && idSaatIni && idSaatIni.has(b.id)) { hasil.update.push(b); return }
    const kunci = normJP(b.jp)
    if (sudahDiFile.has(kunci)) { hasil.dobel.push(b); return }
    sudahDiFile.add(kunci)
    if (sisi === 'kanan') {
      if (dbJp.has(kunci)) { hasil.blok.push({ ...b, di: dbJp.get(kunci) }); return }
      const cocok = pecahTag(b.kata_baru).flatMap(t => [...(dbJp.get(normJP(t)) || []), ...(dbTag.get(normJP(t)) || [])])
      if (cocok.length) { hasil.warn.push({ ...b, di: cocok }); return }
    } else {
      const cocok = [...(dbJp.get(kunci) || []), ...(dbTag.get(kunci) || [])]
      if (cocok.length) { hasil.warn.push({ ...b, di: cocok }); return }
    }
    hasil.ok.push(b)
  })
  return hasil
}

function ringkasDi(di) {
  const uniq = [...new Set(di.map(d => d.nama + (d.tanggal ? ` (${d.tanggal})` : '')))]
  return uniq.slice(0, 2).join(', ') + (uniq.length > 2 ? ` +${uniq.length - 2}` : '')
}

// ---------- komponen ----------
// mode 'paket' : masukin ke paket yang lagi dibuka (butuh paketId + bagianList)
// mode 'root'  : bikin paket baru dari tiap sheet di folder aktif (butuh folderId + urutanAwal)
export default function ImportExcel({ mode, sisi, paketId, bagianList = [], folderId = null, urutanAwal = 0, onDone, style, kecil: tombolKecil = false, kataList = null, namaPaket = '' }) {
  const [menu, setMenu] = useState(false)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(null)
  const [paksa, setPaksa] = useState(false)
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
      const kolom = KOLOM[sisi]
      const wb = new ExcelJS.Workbook()

      const ws = wb.addWorksheet(mode === 'root' ? 'Paket 1' : 'Kata')
      ws.columns = kolom.map(c => ({ header: c.judul, width: c.field === 'jp' || c.field === 'arti' ? 30 : 22 }))
      ws.getRow(1).eachCell((cell, i) => {
        cell.font = { bold: true, color: { argb: kolom[i - 1].wajib ? 'FFFFFFFF' : 'FF2D6A4A' } }
        if (kolom[i - 1].wajib) {
          // "stabilo biru" di header kolom wajib, biar langsung kelihatan mana yang harus diisi
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3E7CB1' } }
        }
      })
      ws.getRow(1).height = 20

      const wsP = wb.addWorksheet('Petunjuk')
      wsP.columns = [{ width: 95 }]
      const petunjuk = [
        'Petunjuk import',
        '',
        `Wajib diisi (header biru): ${kolom.filter(c => c.wajib).map(c => c.judul).join(' dan ')}. Kolom lain (header hijau) boleh dikosongin.`,
        mode === 'root'
          ? 'Satu sheet = satu paket baru. Nama sheet jadi nama paket (maks. 31 karakter). Tambah sheet buat paket lain.'
          : 'Cuma sheet pertama (selain sheet Petunjuk ini) yang dibaca.',
        sisi === 'kanan' ? 'Kata Baru: pisahkan pakai koma, contoh: 勉強, 宿題' : '',
        sisi === 'kiri' ? 'Plesetan Indo: plesetan bunyi kata dalam bahasa Indonesia (jembatan keledai), contoh: koro bu → kacang koro bu. Dipakai di mode tes "Plesetan → Kanji + Arti".' : '',
        'Bagian: nama bagian (contoh: Episode 1). Bagian yang belum ada dibuat otomatis.',
        'Kata/kalimat yang sudah ada di paket lain akan dilewati (bisa dipaksa masuk lewat pratinjau).',
        'Jangan ubah nama kolom di baris pertama. Sheet bernama "Petunjuk" nggak ikut diimpor.',
      ].filter(Boolean)
      petunjuk.forEach(t => wsP.addRow([t]))
      wsP.getRow(1).font = { bold: true, size: 13, color: { argb: 'FF2D6A4A' } }

      const buf = await wb.xlsx.writeBuffer()
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `template-import-${sisi === 'kanan' ? 'harian' : 'buku'}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) { alert('Gagal bikin template: ' + e.message) }
    setBusy(false)
  }

  // Export SEMUA kata di paket ini (hafal atau belum, nggak difilter) ke
  // Excel, lengkap sama kolom ID & Hafal yang tersembunyi maksudnya -- biar
  // kalau file ini diedit terus di-upload balik lewat "Pilih file Excel",
  // baris yang ID-nya cocok otomatis di-UPDATE, bukan dianggap baru.
  async function exportSemuaKata() {
    setMenu(false)
    if (!kataList || kataList.length === 0) { alert('Belum ada kata di paket ini buat di-export.'); return }
    setBusy(true)
    try {
      const ExcelJS = await loadExcelJS()
      const kolom = KOLOM[sisi]
      const wb = new ExcelJS.Workbook()
      const ws = wb.addWorksheet('Kata')
      const semuaKolom = [
        { judul: 'ID', wch: 10 },
        ...kolom.map(c => ({ judul: c.judul, wch: c.field === 'jp' || c.field === 'arti' ? 28 : 20 })),
        { judul: 'Hafal', wch: 10 },
      ]
      ws.columns = semuaKolom.map(c => ({ header: c.judul, width: c.wch }))
      ws.getRow(1).font = { bold: true, color: { argb: 'FF2D6A4A' } }
      ws.getColumn(1).font = { color: { argb: 'FFB8C8B8' }, italic: true } // kolom ID diredupin, bukan buat diisi tangan

      ;[...kataList].sort((a, b) => (a.urutan ?? 0) - (b.urutan ?? 0)).forEach(k => {
        const baris = [k.id, ...kolom.map(c => k[c.field] ?? ''), k.hafal ? 'Ya' : '']
        ws.addRow(baris)
      })

      const wsP = wb.addWorksheet('Petunjuk')
      wsP.columns = [{ width: 100 }]
      ;[
        'Petunjuk export',
        '',
        `Isi: SEMUA kata di paket "${namaPaket}" (hafal maupun belum), total ${kataList.length} kata.`,
        'Boleh diedit bebas buat ngebenerin typo, nambah/isi kolom opsional, dsb.',
        'Kolom ID JANGAN diubah/dihapus -- itu yang bikin baris ini ke-detect sebagai kata YANG SAMA pas di-upload balik, jadi hasilnya UPDATE bukan nambah data baru/dobel.',
        'Kalau mau nambah kata baru: tambah baris baru di bawah, kosongin aja kolom ID-nya.',
        'Kolom Hafal: isi "Ya" kalau udah hafal, kosongin kalau belum.',
        'Upload balik file ini lewat tombol yang sama > "Pilih file Excel".',
      ].forEach(t => wsP.addRow([t]))
      wsP.getRow(1).font = { bold: true, size: 13, color: { argb: 'FF2D6A4A' } }

      const buf = await wb.xlsx.writeBuffer()
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const namaFile = (namaPaket || 'kotoba').replace(/[^\w\u3040-\u30ff\u4e00-\u9faf-]+/g, '_')
      a.download = `kotoba-${namaFile}-${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click()
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
      let namaSheet = wb.SheetNames.filter(n => n.trim().toLowerCase() !== 'petunjuk')
      const catatan = []
      if (mode === 'paket' && namaSheet.length > 1) {
        catatan.push(`File punya ${namaSheet.length} sheet, cuma "${namaSheet[0]}" yang dipakai.`)
        namaSheet = namaSheet.slice(0, 1)
      }
      const dbKata = await ambilSemuaKata()
      const idSaatIni = mode === 'paket' ? new Set(dbKata.filter(r => r.paket_id === paketId).map(r => r.id)) : null
      const sudahDiFile = new Set()
      const sheets = namaSheet.map(nama => {
        const r = bacaSheet(XLSX, wb.Sheets[nama], sisi)
        return { nama, error: r.error, kosong: r.kosong, ...(r.baris.length ? klasifikasi(r.baris, sisi, dbKata, sudahDiFile, idSaatIni) : { ok: [], lengkap: [], dobel: [], blok: [], warn: [], update: [] }) }
      })
      const pesanKurang = []
      sheets.forEach(s => {
        s.lengkap?.forEach(b => {
          const kolomJp = sisi === 'kanan' ? 'Kalimat JP' : 'Kata JP'
          const hilang = !b.jp && !b.arti ? `${kolomJp} & Arti` : !b.jp ? kolomJp : 'Arti'
          pesanKurang.push(`${mode === 'root' ? `Sheet "${s.nama}", ` : ''}baris ${b._no}: ${hilang} kosong`)
        })
      })
      if (pesanKurang.length > 0) {
        alert(
          `Maaf, ada ${pesanKurang.length} baris yang belum lengkap. Kata JP dan Arti wajib diisi, lengkapi dulu ya:\n\n` +
          pesanKurang.slice(0, 15).join('\n') +
          (pesanKurang.length > 15 ? `\n…dan ${pesanKurang.length - 15} baris lainnya` : '') +
          '\n\nLengkapi dulu di Excel-nya, lalu upload ulang.'
        )
        setBusy(false)
        return
      }

      setPaksa(false)
      setPreview({ namaFile: file.name, sheets, catatan })
    } catch (err) {
      alert('Gagal baca file Excel: ' + (err.message || err))
    }
    setBusy(false)
  }

  const hitungMasuk = s => s.ok.length + (paksa ? s.warn.length : 0) + s.update.length

  async function jalankan() {
    setBusy(true)
    let paketBaru = 0, kataMasuk = 0, kataUpdate = 0
    try {
      for (const s of preview.sheets) {
        if (s.update.length > 0) {
          for (const u of s.update) {
            const payloadUpdate = {
              jp: u.jp, arti: u.arti, bagian: u.bagian || '',
              contoh_kalimat: u.contoh_kalimat, bunshuu: u.bunshuu,
              konteks: u.konteks, nuansa: u.nuansa, kata_baru: u.kata_baru,
              ...(sisi === 'kiri' ? { plesetan: u.plesetan } : {}),
            }
            if (u.hafal !== undefined) payloadUpdate.hafal = u.hafal
            const { error } = await supabase.from('kata').update(payloadUpdate).eq('id', u.id)
            if (error) throw new Error(`Gagal update kata (ID ${u.id}): ${error.message}`)
            kataUpdate++
          }
        }
        const rows = [...s.ok, ...(paksa ? s.warn : [])]
        if (rows.length === 0 && s.update.length === 0) continue
        const bagianBaru = []
        ;[...rows, ...s.update].forEach(r => { if (r.bagian && !bagianBaru.includes(r.bagian)) bagianBaru.push(r.bagian) })
        if (rows.length === 0) continue
        let targetId = paketId
        let dibuatBaru = false
        if (mode === 'root') {
          const u = urutanAwal + paketBaru
          const payload = { nama: s.nama.trim(), folder_id: folderId, urutan_dalam_grup: u, urutan: u, bagian_list: bagianBaru }
          if (folderId === null) payload.kolom = sisi
          const { data, error } = await supabase.from('paket').insert(payload).select('id').single()
          if (error) throw new Error(`Gagal bikin paket "${s.nama}": ${error.message}`)
          targetId = data.id
          dibuatBaru = true
          paketBaru++
        } else {
          const gabung = [...bagianList, ...bagianBaru.filter(b => !bagianList.includes(b))]
          if (gabung.length !== bagianList.length) {
            const { error } = await supabase.from('paket').update({ bagian_list: gabung }).eq('id', paketId)
            if (error) throw new Error('Gagal nambah bagian: ' + error.message)
          }
        }
        const t0 = Date.now()
        const payloadKata = rows.map((r, i) => ({
          paket_id: targetId, jp: r.jp, arti: r.arti, bagian: r.bagian || '',
          contoh_kalimat: r.contoh_kalimat, bunshuu: r.bunshuu,
          konteks: r.konteks, nuansa: r.nuansa, kata_baru: r.kata_baru, urutan: t0 + i,
          ...(sisi === 'kiri' ? { plesetan: r.plesetan } : {}),
          ...(r.hafal !== undefined ? { hafal: r.hafal } : {}),
        }))
        for (let i = 0; i < payloadKata.length; i += 200) {
          const { error } = await supabase.from('kata').insert(payloadKata.slice(i, i + 200))
          if (error) {
            if (dibuatBaru) await supabase.from('paket').delete().eq('id', targetId) // batalin paket setengah jadi
            throw new Error(`Gagal simpan kata${s.nama ? ` di "${s.nama}"` : ''}: ${error.message}`)
          }
        }
        kataMasuk += rows.length
      }
      setPreview(null)
      const bagianUpdate = kataUpdate > 0 ? `${kataUpdate} kata di-update` : ''
      const bagianBaru = mode === 'root' ? `${paketBaru} paket baru, ${kataMasuk} kata masuk` : `${kataMasuk} kata masuk`
      alert(`Selesai! ${[bagianBaru, bagianUpdate].filter(Boolean).join(', ')}.`)
    } catch (err) {
      alert(err.message)
    }
    setBusy(false)
    onDone?.()
  }

  // ---------- tampilan ----------
  const totalMasuk = preview ? preview.sheets.reduce((n, s) => n + hitungMasuk(s), 0) : 0
  const totalWarn = preview ? preview.sheets.reduce((n, s) => n + s.warn.length, 0) : 0
  const totalUpdate = preview ? preview.sheets.reduce((n, s) => n + s.update.length, 0) : 0
  const kecil = { fontSize: 11, color: '#7a8a80', lineHeight: 1.6 }

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block', ...style }}>
      <button className={tombolKecil ? 'act-btn' : 'icon-btn'} title="Excel: import, export, atau download template" disabled={busy} onClick={() => setMenu(m => !m)}
        style={tombolKecil ? { fontWeight: 700 } : { width: 34, height: 34, fontSize: 13, fontWeight: 700 }}>
        {busy && !preview ? '⏳' : '🔃'}
      </button>
      <input ref={inputRef} type="file" accept=".xlsx,.xls" onChange={pilihFile} style={{ display: 'none' }} />
      {menu && (
        <div style={{ position: 'absolute', top: '110%', right: 0, background: '#fff', borderRadius: 10, boxShadow: '0 6px 18px rgba(0,0,0,.15)', border: '1px solid #e5e5e5', minWidth: 230, zIndex: 20, overflow: 'hidden' }}>
          <button style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', background: '#fff', cursor: 'pointer', fontSize: 13 }}
            onClick={() => { setMenu(false); inputRef.current?.click() }}>📥 Pilih file Excel (import/update)</button>
          {kataList !== null && (
            <button style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', borderTop: '1px solid #f0f0f0', background: '#fff', cursor: 'pointer', fontSize: 13 }}
              onClick={exportSemuaKata}>📤 Export semua kata ({kataList.length})</button>
          )}
          <button style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', borderTop: '1px solid #f0f0f0', background: '#fff', cursor: 'pointer', fontSize: 13 }}
            onClick={downloadTemplate}>📄 Download template kosong</button>
        </div>
      )}

      {preview && (
        <div className="modal-overlay open">
          <div className="modal-box" style={{ maxWidth: 460, maxHeight: '85vh', overflowY: 'auto', textAlign: 'left' }}>
            <div className="modal-title" style={{ textAlign: 'center' }}>Import {sisi === 'kanan' ? 'Harian' : 'Buku'}</div>
            <div style={{ ...kecil, textAlign: 'center', marginBottom: 10 }}>{preview.namaFile}</div>
            {preview.catatan.map((c, i) => <div key={i} style={{ ...kecil, marginBottom: 6 }}>ℹ️ {c}</div>)}

            {preview.sheets.length === 0 && <div style={kecil}>Nggak ada sheet yang bisa dibaca.</div>}
            {preview.sheets.map(s => (
              <div key={s.nama} style={{ border: '1.5px solid #d6e8d6', borderRadius: 10, padding: 10, marginBottom: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#2d6a4a' }}>
                  {mode === 'root' ? '📚 ' : ''}{s.nama}
                </div>
                {s.error && <div style={{ fontSize: 12, color: '#c0392b' }}>⚠️ {s.error}</div>}
                {s.kosong && <div style={kecil}>Sheet kosong.</div>}
                {!s.error && !s.kosong && (
                  <>
                    <div style={{ fontSize: 12 }}>
                      {s.update.length > 0 && `🔄 ${s.update.length} di-update · `}
                      ✅ {s.ok.length + (paksa ? s.warn.length : 0)} baru masuk
                      {s.blok.length + s.dobel.length + (paksa ? 0 : s.warn.length) > 0 && ` · ⏭ ${s.blok.length + s.dobel.length + (paksa ? 0 : s.warn.length)} dilewati`}
                      {s.lengkap.length > 0 && ` · ❗ ${s.lengkap.length} baris nggak lengkap`}
                    </div>
                    {[...s.blok, ...(paksa ? [] : s.warn)].slice(0, 6).map((b, i) => (
                      <div key={i} style={kecil}>
                        <span style={{ fontFamily: "'Noto Serif JP', serif" }}>{b.jp}</span> — udah ada di {ringkasDi(b.di)}
                      </div>
                    ))}
                    {s.dobel.slice(0, 3).map((b, i) => (
                      <div key={i} style={kecil}><span style={{ fontFamily: "'Noto Serif JP', serif" }}>{b.jp}</span> — dobel di file (baris {b._no})</div>
                    ))}
                    {s.lengkap.slice(0, 3).map((b, i) => (
                      <div key={i} style={kecil}>Baris {b._no}: {b.jp ? 'Arti' : 'Kata JP'} kosong</div>
                    ))}
                    {(s.blok.length + (paksa ? 0 : s.warn.length)) > 6 && <div style={kecil}>…dan yang lain</div>}
                  </>
                )}
              </div>
            ))}

            {totalWarn > 0 && (
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, margin: '10px 2px', cursor: 'pointer' }}>
                <input type="checkbox" checked={paksa} onChange={e => setPaksa(e.target.checked)} style={{ marginTop: 2 }} />
                <span>Tetep masukin {totalWarn} kata yang udah pernah dicatat di paket lain</span>
              </label>
            )}
            {sisi === 'kanan' && <div style={kecil}>Kalimat yang persis sama dengan yang udah ada selalu dilewati, sama kayak input manual.</div>}

            <div className="modal-btns" style={{ marginTop: 12 }}>
              <button disabled={busy} onClick={() => setPreview(null)}>Batal</button>
              <button className="confirm" disabled={busy || totalMasuk === 0} onClick={jalankan}>
                {busy ? 'Memproses...' : totalUpdate > 0
                  ? `Proses (${totalUpdate} update, ${totalMasuk - totalUpdate} baru)`
                  : `Import ${totalMasuk} kata`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
