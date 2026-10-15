import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { loadXLSX, loadExcelJS } from '../lib/excelLoaders'

// ---------- konfigurasi kolom per sisi ----------
// kiri = Buku (kata + bunshuu), kanan = Harian (kalimat + konteks + nuansa)
// kolom yang isinya teks Jepang -> di Excel dikasih font MS Mincho (tampilan ala soal JLPT)
const KOLOM_JEPANG = ['jp', 'contoh_kalimat', 'kata_baru']
const FONT_EXCEL_JEPANG = { name: 'MS Mincho', size: 12 }

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
// romaji bantuan di akhir kalimat, contoh: 首を拭きます。 (kubi o fukimasu) -- diabaikan pas mencocokkan
const ROMAJI_AKHIR = /\s*[（(](?=[^)）]*[a-zāīūēō])[A-Za-z\u00C0-\u024F\s.,'’\-!?]+[)）]\s*$/
function normJP(s) {
  return String(s ?? '').replace(ROMAJI_AKHIR, '').trim().toLowerCase().replace(/[\s、。！？・「」]/g, '').normalize('NFKC')
}
const kunciHeader = h => String(h ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
// pemisah Kata Baru: koma Jepang (、) tanpa spasi ATAU koma biasa (, ) -- dua-duanya diterima
const pecahTag = s => String(s || '').split(/[,，、､]/).map(w => w.trim()).filter(Boolean)
// Kata Baru boleh "kata=arti" (atau ＝). kataSaja() ambil kata-nya aja buat pencocokan.
const kataSaja = t => String(t).split(/[=＝]/)[0].trim()

// ambil jp + kata_baru semua kata (Supabase default cuma ngembaliin 1000 baris per request)
// DIPAKAI CUMA BUAT INFO di pratinjau: Kata Baru yang udah pernah dicatat. Nggak nahan import.
async function ambilSemuaKata() {
  const semua = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('kata').select('jp, kata_baru, paket:paket_id (nama, tanggal)').range(from, from + 999)
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

// ---------- klasifikasi: cuma 2 golongan ----------
// lengkap = Kata/Kalimat JP dan Arti terisi -> masuk (SEMUA masuk sebagai kata baru,
//           urut sesuai baris di file, tanpa cek duplikat dan tanpa kolom ID)
// kurang  = salah satu kosong -> ditolak dan ditunjukin barisnya
// field lain (blok, warn, update, dst) sengaja dibiarin kosong biar tampilan pratinjau tetap jalan
function klasifikasi(baris) {
  const hasil = { ok: [], lengkap: [], dobel: [], blok: [], warn: [], update: [], cocok: [], sama: [], ambigu: [] }
  baris.forEach(b => {
    if (!b.jp || !b.arti) hasil.lengkap.push(b)
    else hasil.ok.push(b)
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
export default function ImportExcel({ mode, sisi, paketId, bagianList = [], folderId = null, urutanAwal = 0, onDone, style, kecil: tombolKecil = false, kataList = null, namaPaket = '', bagianAktif = '' }) {
  const [menu, setMenu] = useState(false)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(null)
  const [paksa, setPaksa] = useState(false)
  // kata lama yang DICENTANG = tetep disimpan (kunci "idSheet|kataTernormalisasi"); yang nggak dicentang = "oke, saya ingat"
  const [simpanSet, setSimpanSet] = useState(() => new Set())
  const [kolomPilih, setKolomPilih] = useState(new Set()) // kolom yang di-update buat kata yang cocok
  const inputRef = useRef(null)
  const wrapRef = useRef(null)
  // kata di Bagian yang lagi dibuka (kosong kalau lagi di "Semua")
  const kataBagian = kataList && bagianAktif ? kataList.filter(k => (k.bagian || '') === bagianAktif) : null

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
      kolom.forEach((c, i) => { if (KOLOM_JEPANG.includes(c.field)) ws.getColumn(i + 1).font = FONT_EXCEL_JEPANG })
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
        sisi === 'kanan' ? 'Kata Baru: pisahkan pakai koma Jepang (、) tanpa spasi, contoh: 勉強、宿題. Arti per kata boleh ditambah pakai = atau ＝, contoh: 勉強＝belajar、宿題＝PR (artinya jangan pakai koma). Koma biasa (,) juga masih bisa.' : '',
        sisi === 'kiri' ? 'Plesetan Indo: plesetan bunyi kata dalam bahasa Indonesia (jembatan keledai), contoh: koro bu → kacang koro bu. Dipakai di mode tes "Plesetan → Kanji + Arti".' : '',
        'Bagian: nama bagian (contoh: Episode 1). Bagian yang belum ada dibuat otomatis.',
        'Semua baris yang lengkap masuk sebagai kata baru, urut sesuai baris di file. Nggak ada pengecekan duplikat.',
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

  // Export kata di paket ini (hafal atau belum, nggak difilter) ke Excel.
  // hanyaBagian = true -> cuma bagian yang lagi dibuka; false -> semua kata (menu
  // ini cuma muncul di tab "Semua"). Nggak ada kolom ID: upload balik = kata baru.
  async function exportKata(hanyaBagian = false) {
    setMenu(false)
    const daftar = hanyaBagian ? (kataBagian || []) : (kataList || [])
    if (daftar.length === 0) { alert(hanyaBagian ? 'Belum ada kata di bagian ini buat di-export.' : 'Belum ada kata di paket ini buat di-export.'); return }
    setBusy(true)
    try {
      const ExcelJS = await loadExcelJS()
      const kolom = KOLOM[sisi]
      const wb = new ExcelJS.Workbook()
      const ws = wb.addWorksheet('Kata')
      const semuaKolom = [
        ...kolom.map(c => ({ judul: c.judul, wch: c.field === 'jp' || c.field === 'arti' ? 28 : 20 })),
        { judul: 'Hafal', wch: 10 },
      ]
      ws.columns = semuaKolom.map(c => ({ header: c.judul, width: c.wch }))
      kolom.forEach((c, i) => { if (KOLOM_JEPANG.includes(c.field)) ws.getColumn(i + 1).font = FONT_EXCEL_JEPANG })
      ws.getRow(1).font = { bold: true, color: { argb: 'FF2D6A4A' } }

      ;[...daftar].sort((a, b) => (a.urutan ?? 0) - (b.urutan ?? 0)).forEach(k => {
        const baris = [...kolom.map(c => k[c.field] ?? ''), k.hafal ? 'Ya' : '']
        ws.addRow(baris)
      })

      const wsP = wb.addWorksheet('Petunjuk')
      wsP.columns = [{ width: 100 }]
      ;[
        'Petunjuk export',
        ' ',
        hanyaBagian
          ? `Isi: kata di bagian "${bagianAktif}" pada paket "${namaPaket}" (hafal maupun belum), total ${daftar.length} kata.`
          : `Isi: SEMUA kata di paket "${namaPaket}" (hafal maupun belum), total ${daftar.length} kata.`,
        hanyaBagian ? 'Biar kata tetap di bagian ini, jangan ubah kolom Bagian. Baris baru yang kolom Bagian-nya dikosongin otomatis masuk ke bagian yang lagi dibuka pas kamu upload.' : '',
        'File ini buat cadangan/dibaca. Kalau di-upload balik, semua barisnya masuk sebagai kata BARU (nggak ada fitur update lewat Excel).',
        'Kolom Hafal: isi "Ya" kalau udah hafal, kosongin kalau belum.',
      ].filter(t => t !== '').forEach(t => wsP.addRow([t]))
      wsP.getRow(1).font = { bold: true, size: 13, color: { argb: 'FF2D6A4A' } }

      const buf = await wb.xlsx.writeBuffer()
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const namaFile = (namaPaket || 'kotoba').replace(/[^\w\u3040-\u30ff\u4e00-\u9faf-]+/g, '_')
      const namaBagianFile = hanyaBagian ? '-' + bagianAktif.replace(/[^\w\u3040-\u30ff\u4e00-\u9faf-]+/g, '_') : ''
      a.download = `kotoba-${namaFile}${namaBagianFile}-${new Date().toISOString().slice(0, 10)}.xlsx`
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
      const sheets = namaSheet.map(nama => {
        const r = bacaSheet(XLSX, wb.Sheets[nama], sisi)
        return { nama, error: r.error, kosong: r.kosong, ...(r.baris.length ? klasifikasi(r.baris) : { ok: [], lengkap: [], dobel: [], blok: [], warn: [], update: [], cocok: [], sama: [], ambigu: [] }) }
      })
      // Deteksi kata yang udah pernah dipelajari (jp semua paket + Kata Baru Harian).
      //  - Harian: yang dicek tiap kata di Kata Baru; pilihan "Oke, saya ingat" cuma buang kata itu, kalimat tetap masuk
      //  - Buku  : yang dicek Kata JP-nya; pilihan "Oke, saya ingat" = SEBARIS kata itu nggak masuk
      // Urutan baris yang masuk tetap sesuai urutan di Excel.
      try {
        const dbKata = await ambilSemuaKata()
        const peta = new Map()
        const tambah = (k, info) => { if (!k) return; if (!peta.has(k)) peta.set(k, []); peta.get(k).push(info) }
        dbKata.forEach(r => {
          const info = { nama: r.paket?.nama, tanggal: r.paket?.tanggal }
          tambah(normJP(r.jp), info)
          pecahTag(r.kata_baru).forEach(t => tambah(normJP(kataSaja(t)), info))
        })
        sheets.forEach((sh, si) => {
          const udah = new Set()
          sh.kid = si
          sh.kataSama = []
          sh.kataSamaKunci = udah
          ;(sh.ok || []).forEach(r => {
            if (sisi === 'kanan') {
              pecahTag(r.kata_baru).forEach(t => {
                const kunci = normJP(kataSaja(t))
                const di = peta.get(kunci)
                if (di && di.length && !udah.has(kunci)) { udah.add(kunci); sh.kataSama.push({ kata: kataSaja(t), kunci, di }) }
              })
            } else {
              const kunci = normJP(r.jp)
              const di = peta.get(kunci)
              if (di && di.length && !udah.has(kunci)) { udah.add(kunci); sh.kataSama.push({ kata: r.jp, kunci, di }) }
            }
          })
        })
      } catch (e) { console.error('Cek kata lama gagal (diabaikan):', e) }
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
      setSimpanSet(new Set())
      setKolomPilih(new Set(sheets.flatMap(s => (s.cocok || []).flatMap(c => Object.keys(c.perubahan))).filter(f => f !== 'bagian')))
      setPreview({ namaFile: file.name, sheets, catatan })
    } catch (err) {
      alert('Gagal baca file Excel: ' + (err.message || err))
    }
    setBusy(false)
  }

  const cocokEfektif = s => (s.cocok || []).filter(c => Object.keys(c.perubahan).some(f => kolomPilih.has(f)))
  // Buku: baris yang katanya udah pernah ada & NGGAK dicentang = nggak dimasukin
  const barisDibuang = s => sisi !== 'kiri' ? 0 : s.ok.filter(r => {
    const k = normJP(r.jp)
    return s.kataSamaKunci?.has(k) && !simpanSet.has(s.kid + '|' + k)
  }).length
  const toggleSimpan = (s, kunci, on) => setSimpanSet(prev => {
    const n = new Set(prev); const key = s.kid + '|' + kunci
    on ? n.add(key) : n.delete(key); return n
  })
  const pilihSemua = (s, on) => setSimpanSet(prev => {
    const n = new Set(prev)
    s.kataSama.forEach(k => { const key = s.kid + '|' + k.kunci; on ? n.add(key) : n.delete(key) })
    return n
  })
  const hitungMasuk = s => s.ok.length - barisDibuang(s) + (paksa ? s.warn.length : 0) + s.update.length + cocokEfektif(s).length

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
        const cocokJalan = cocokEfektif(s).map(c => {
          const payload = {}
          Object.keys(c.perubahan).forEach(f => { if (kolomPilih.has(f)) payload[f] = c.perubahan[f] })
          return { id: c.kataId, payload }
        })
        for (let i = 0; i < cocokJalan.length; i += 10) {
          const hasilBatch = await Promise.all(cocokJalan.slice(i, i + 10).map(x => supabase.from('kata').update(x.payload).eq('id', x.id)))
          const gagal = hasilBatch.find(h => h.error)
          if (gagal) throw new Error('Gagal update kata: ' + gagal.error.message)
          kataUpdate += hasilBatch.length
        }
        const rows = [...s.ok, ...(paksa ? s.warn : [])]
          .filter(r => !(sisi === 'kiri' && s.kataSamaKunci?.has(normJP(r.jp)) && !simpanSet.has(s.kid + '|' + normJP(r.jp))))
          .sort((a, b) => (a._no ?? 0) - (b._no ?? 0)).map(r => ({
          ...r,
          bagian: r.bagian || (mode === 'paket' ? bagianAktif : ''),
          // "Oke, saya ingat": kata yang udah pernah dipelajari dibuang dari Kata Baru, kalimatnya tetap masuk
          // sekalian diseragamkan ke format simpanan app (pemisah ", "), apa pun pemisah di Excel-nya
          kata_baru: pecahTag(r.kata_baru)
            .filter(t => { const k = normJP(kataSaja(t)); return !s.kataSamaKunci?.has(k) || simpanSet.has(s.kid + '|' + k) })
            .map(t => t.replace('＝', '='))
            .join(', '),
        }))
        if (rows.length === 0 && s.update.length === 0) continue
        const bagianBaru = []
        ;[...rows, ...s.update].forEach(r => { if (r.bagian && !bagianBaru.includes(r.bagian)) bagianBaru.push(r.bagian) })
        cocokJalan.forEach(x => { const b = x.payload.bagian; if (b && !bagianBaru.includes(b)) bagianBaru.push(b) })
        if (mode === 'paket' && bagianBaru.length > 0) {
          const gabungUpd = [...bagianList, ...bagianBaru.filter(b => !bagianList.includes(b))]
          if (gabungUpd.length !== bagianList.length) {
            const { error } = await supabase.from('paket').update({ bagian_list: gabungUpd }).eq('id', paketId)
            if (error) throw new Error('Gagal nambah bagian: ' + error.message)
          }
        }
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
  const totalUpdate = preview ? preview.sheets.reduce((n, s) => n + s.update.length + cocokEfektif(s).length, 0) : 0
  const kolomCocok = preview
    ? KOLOM[sisi].filter(c => c.field !== 'jp')
        .map(c => ({ field: c.field, judul: c.judul, jumlah: preview.sheets.reduce((n, s) => n + (s.cocok || []).filter(x => x.perubahan[c.field] !== undefined).length, 0) }))
        .filter(c => c.jumlah > 0)
    : []
  const kecil = { fontSize: 11, color: '#7a8a80', lineHeight: 1.6 }
  // ukuran dipaksa biar nggak ikut gaya input global (yang bikin checkbox melebar & berantakan)
  const cbStyle = { width: 16, height: 16, minWidth: 16, padding: 0, margin: '2px 0 0', flex: 'none', cursor: 'pointer' }
  const miniBtn = { fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid #b8d8b8', background: '#f0f7f0', color: '#2d6a4a', cursor: 'pointer', width: 'auto' }

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
            onClick={() => { setMenu(false); inputRef.current?.click() }}>📥 Pilih file Excel (import)</button>
          {kataList !== null && bagianAktif && (
            <button style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', borderTop: '1px solid #f0f0f0', background: '#fff', cursor: 'pointer', fontSize: 13 }}
              onClick={() => exportKata(true)}>📤 Export bagian ini ({kataBagian.length})</button>
          )}
          {kataList !== null && !bagianAktif && (
            <button style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', borderTop: '1px solid #f0f0f0', background: '#fff', cursor: 'pointer', fontSize: 13 }}
              onClick={() => exportKata(false)}>📤 Export semua kata ({kataList.length})</button>
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
            {mode === 'paket' && bagianAktif && <div style={{ ...kecil, marginBottom: 6 }}>ℹ️ Kata baru yang kolom Bagian-nya kosong akan masuk ke bagian "{bagianAktif}".</div>}

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
                      {(s.cocok || []).length > 0 && `🔁 ${s.cocok.length} cocok & berubah · `}
                      ✅ {s.ok.length - barisDibuang(s) + (paksa ? s.warn.length : 0)} baru masuk
                      {s.blok.length + s.dobel.length + (paksa ? 0 : s.warn.length) > 0 && ` · ⏭ ${s.blok.length + s.dobel.length + (paksa ? 0 : s.warn.length)} dilewati`}
                      {s.lengkap.length > 0 && ` · ❗ ${s.lengkap.length} baris nggak lengkap`}
                      {(s.sama || []).length > 0 && ` · = ${s.sama.length} sama persis`}
                      {(s.ambigu || []).length > 0 && ` · ❓ ${s.ambigu.length} ambigu`}
                    </div>
                    {(s.kataSama || []).length > 0 && (() => {
                      const disimpan = s.kataSama.filter(k => simpanSet.has(s.kid + '|' + k.kunci)).length
                      return (
                        <div style={{ marginTop: 8 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#2d6a4a' }}>
                            🌱 {s.kataSama.length} kata{sisi === 'kanan' ? ' di Kata Baru' : ''} udah pernah dipelajari
                          </div>
                          <div style={kecil}>
                            Coba inget artinya dulu. Yang <b>dicentang</b> tetap disimpan, yang <b>nggak dicentang</b> dianggap udah ingat
                            {sisi === 'kanan' ? ' (dibuang dari Kata Baru, kalimatnya tetap masuk).' : ' (barisnya nggak dimasukin).'}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '6px 0' }}>
                            <button type="button" style={miniBtn} onClick={() => pilihSemua(s, true)}>Simpan semua</button>
                            <button type="button" style={miniBtn} onClick={() => pilihSemua(s, false)}>Ingat semua</button>
                            <span style={{ ...kecil, marginLeft: 'auto' }}>{disimpan} disimpan · {s.kataSama.length - disimpan} ingat</span>
                          </div>
                          <div style={{ maxHeight: 210, overflowY: 'auto', border: '1px solid #e3eee3', borderRadius: 8, padding: '2px 8px', background: '#fff' }}>
                            {s.kataSama.map((k, i) => (
                              <label key={k.kunci} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, padding: '6px 0', cursor: 'pointer', borderTop: i === 0 ? 'none' : '1px solid #f0f5f0' }}>
                                <input type="checkbox" checked={simpanSet.has(s.kid + '|' + k.kunci)} onChange={e => toggleSimpan(s, k.kunci, e.target.checked)} style={cbStyle} />
                                <span style={{ lineHeight: 1.5 }}>
                                  <span style={{ fontFamily: "'Noto Serif JP', serif", fontWeight: 600 }}>{k.kata}</span>
                                  <span style={{ color: '#7a8a80' }}> — di {ringkasDi(k.di)}</span>
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )
                    })()}
                    {[...s.blok, ...(paksa ? [] : s.warn)].slice(0, 6).map((b, i) => (
                      <div key={i} style={kecil}>
                        <span style={{ fontFamily: "'Noto Serif JP', serif" }}>{b.jp}</span> — udah ada di {ringkasDi(b.di)}
                      </div>
                    ))}
                    {(s.ambigu || []).slice(0, 3).map((b, i) => (
                      <div key={'a' + i} style={kecil}><span style={{ fontFamily: "'Noto Serif JP', serif" }}>{b.jp}</span> — ada lebih dari satu di paket ini, dilewati (pakai kolom ID buat update)</div>
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

            {kolomCocok.length > 0 && (
              <div style={{ border: '1.5px solid #d6e8d6', borderRadius: 10, padding: 10, margin: '10px 0' }}>
                <div style={{ fontWeight: 700, fontSize: 12, color: '#2d6a4a', marginBottom: 4 }}>
                  🔁 Kata yang udah ada di paket ini dicocokkan lewat {sisi === 'kanan' ? 'Kalimat JP' : 'Kata JP'}. Kolom mana yang mau di-update?
                </div>
                {kolomCocok.map(c => (
                  <label key={c.field} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, padding: '2px 0', cursor: 'pointer' }}>
                    <input type="checkbox" checked={kolomPilih.has(c.field)}
                      onChange={e => setKolomPilih(prev => { const n = new Set(prev); e.target.checked ? n.add(c.field) : n.delete(c.field); return n })} />
                    <span>{c.judul} <span style={{ color: '#7a8a80' }}>({c.jumlah} kata){c.field === 'bagian' ? ' - mindahin kata ke bagian ini, urutan tetap' : ''}</span></span>
                  </label>
                ))}
                <div style={kecil}>Sel yang kosong di file nggak menimpa isi yang udah ada. Kata JP dan urutan nggak berubah. Bagian cuma berubah kalau dicentang.</div>
              </div>
            )}

            {totalWarn > 0 && (
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, margin: '10px 2px', cursor: 'pointer' }}>
                <input type="checkbox" checked={paksa} onChange={e => setPaksa(e.target.checked)} style={{ marginTop: 2 }} />
                <span>Tetep masukin {totalWarn} kata yang udah pernah dicatat di paket lain</span>
              </label>
            )}

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
