import { useEffect, useMemo, useState } from 'react'
import { supabase, supabaseStorage } from '../supabaseClient'
import ImportExcel from '../components/ImportExcel'
import { fetchAll } from '../lib/fetchAll'
import { loadExcelJS } from '../lib/excelLoaders'

// Kata Baru boleh berisi arti per kata: "聞=telinga、見=lihat" (= atau ＝ antara kata & arti).
// Pemisah antar pasangan: koma Jepang (、) atau koma biasa. Data lama tanpa arti tetap valid.
// Format lengkap per kata: "過ごす=menghabiskan waktu|過ごせます|可能形" -> kata=arti|bentuk di kalimat|jenis perubahan
function parseKataBaru(s) {
  return String(s || '').split(/[,，、､]/).map(t => t.trim()).filter(Boolean).map(t => {
    const i = t.search(/[=＝]/)
    if (i === -1) return { kata: t, arti: '', bentuk: '', jenis: '' }
    const [arti = '', bentuk = '', jenis = ''] = t.slice(i + 1).split(/[|｜]/).map(x => x.trim())
    return { kata: t.slice(0, i).trim(), arti, bentuk, jenis }
  }).filter(x => x.kata)
}
// daftar jenis perubahan kata (nilai = yang disimpan, label = yang kelihatan di dropdown)
const JENIS_PERUBAHAN = [
  { nilai: 'ます形', label: 'ます形 (sopan)' },
  { nilai: 'て形', label: 'て形' },
  { nilai: 'た形', label: 'た形 (lampau)' },
  { nilai: 'ない形', label: 'ない形 (negatif)' },
  { nilai: '可能形', label: '可能形 (potensial)' },
  { nilai: '受身形', label: '受身形 (pasif)' },
  { nilai: '使役形', label: '使役形 (kausatif)' },
  { nilai: '命令形', label: '命令形 (imperatif)' },
  { nilai: '意向形', label: '意向形 (ajakan)' },
  { nilai: '条件形', label: '条件形 (kondisional)' },
]

// kunci pencocokan kata: buang romaji di ujung & tanda baca, biar "厳しい" = "厳しい (kibishii)"
const kunciKata = s => String(s ?? '')
  .replace(/\s*[（(](?=[^)）]*[a-zāīūēō])[A-Za-z\u00C0-\u024F\s.,'’\-!?]+[)）]\s*$/, '')
  .trim().toLowerCase().replace(/[\s、。！？・「」]/g, '').normalize('NFKC')
const tanpaRomaji = s => String(s || '').replace(/\s*[（(][^)）]*[)）]\s*$/, '').trim()
function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
// tebalkan bentuk yang ditebak di dalam kalimat contoh
function sorotKalimat(kal, bentuk) {
  const i = bentuk ? kal.indexOf(bentuk) : -1
  if (i === -1) return kal
  return <>{kal.slice(0, i)}<b style={{ color: '#2d6a4a' }}>{bentuk}</b>{kal.slice(i + bentuk.length)}</>
}

export default function PaketList({ goTo, openPaket }) {
  const [folders, setFolders] = useState([])
  const [paketList, setPaketList] = useState([])
  const [folderKiri, setFolderKiri] = useState(null)   // currentFolderId panel BUKU (null = root panel kiri)
  const [folderKanan, setFolderKanan] = useState(null) // currentFolderId panel HARIAN (null = root panel kanan)
  const [search, setSearch] = useState('')
  const [jenisFilter, setJenisFilter] = useState('') // '' = semua kata, '*' = semua yang ada perubahannya, atau satu jenis
  const [loading, setLoading] = useState(true)
  const [exportLoading, setExportLoading] = useState(false)
  const [movePicker, setMovePicker] = useState(null) // { type: 'folder'|'paket', item }
  const [kamusHasil, setKamusHasil] = useState([])
  const [kamusBuka, setKamusBuka] = useState(() => new Set()) // id kata yang daftar contohnya dibuka semua
  const [kamusLoading, setKamusLoading] = useState(false)
  const [tambahMenuSisi, setTambahMenuSisi] = useState(null) // 'kiri' | 'kanan' | null
  const [streak, setStreak] = useState(0)
  const [aktifHariIni, setAktifHariIni] = useState(true)
  const [tesUbah, setTesUbah] = useState(null) // null = tertutup, {loading} = memuat, selain itu = tes berjalan

  useEffect(() => {
    function handleClickOutside(e) {
      if (!e.target.closest('[data-tambah-menu]')) setTambahMenuSisi(null)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function muatData() {
    setLoading(true)
    const [{ data: fData, error: fErr }, { data: pData, error: pErr }, { data: hafalData }, { data: aktivitasData }] = await Promise.all([
      fetchAll(() => supabase.from('folders').select('id, nama, parent_id, urutan, kolom').order('urutan', { ascending: true }).order('id')),
      fetchAll(() => supabase
        .from('paket')
        .select('id, nama, folder_id, urutan_dalam_grup, pdf_path, kolom, kata(count), diary_pages(isi_teks)')
        .order('urutan_dalam_grup', { ascending: true }).order('id')),
      fetchAll(() => supabase.from('kata').select('paket_id').eq('hafal', true).order('id')),
      fetchAll(() => supabase.from('aktivitas_harian').select('tanggal').order('tanggal')),
    ])
    if (!fErr && fData) setFolders(fData)
    if (!pErr && pData) {
      const mapHafal = {}
      ;(hafalData || []).forEach(k => { mapHafal[k.paket_id] = (mapHafal[k.paket_id] || 0) + 1 })
      setPaketList(pData.map(p => ({
        ...p,
        jumlahKata: p.kata?.[0]?.count || 0,
        jumlahHafal: mapHafal[p.id] || 0,
        adaIsiDiary: (p.diary_pages || []).some(d => d.isi_teks && d.isi_teks.trim().length > 0),
      })))
    }
    const hasil = hitungStreak(new Set((aktivitasData || []).map(a => a.tanggal)))
    setStreak(hasil.streak)
    setAktifHariIni(hasil.aktifHariIni)
    setLoading(false)
  }
  function pad2(n) { return n < 10 ? '0' + n : '' + n }
  function hitungStreak(tanggalSet) {
    let d = new Date()
    const keyHariIni = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
    const aktifHariIni = tanggalSet.has(keyHariIni)
    // kalau hari ini belum ada aktivitas, jangan langsung dianggap putus --
    // harinya kan belum abis. Mulai ngitung dari kemarin dulu; streak baru
    // beneran ke-reset kalau KEMARIN juga kosong.
    if (!aktifHariIni) d.setDate(d.getDate() - 1)
    let streak = 0
    while (true) {
      const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
      if (tanggalSet.has(key)) { streak++; d.setDate(d.getDate() - 1) } else break
    }
    return { streak, aktifHariIni }
  }
  // total kata & yang udah hafal di dalam folder ini + semua sub-foldernya
  function progresFolder(folderId) {
    const idTurunan = idFolderTurunan(folderId)
    const relevan = paketList.filter(p => idTurunan.has(p.folder_id))
    const total = relevan.reduce((s, p) => s + p.jumlahKata, 0)
    const hafal = relevan.reduce((s, p) => s + p.jumlahHafal, 0)
    return { total, hafal, persen: total > 0 ? Math.round((hafal / total) * 100) : null }
  }

  useEffect(() => { muatData() }, [])

  // ----- kamus: cari kata (kanji/kana atau arti) di semua paket -----
  // hasilnya bisa 2 jenis: (1) match normal di jp/arti -> tampil apa
  // adanya, (2) match di kata_baru (kata yang ditag dalem kalimat Harian,
  // nggak punya arti sendiri) -> ditampilin sebagai "kata badge" dengan
  // kalimat asal + artinya sebagai konteks di bawahnya.
  useEffect(() => {
    const term = search.trim()
    if (!term && !jenisFilter) { setKamusHasil([]); setKamusLoading(false); return }
    setKamusLoading(true)
    const timer = setTimeout(async () => {
      // limit dilonggarin (200) karena banyak kalimat/kata ikut ketarik query tapi nanti dikelompokkan di bawah
      let q = supabase
        .from('kata')
        .select('id, jp, arti, kata_baru, contoh_kalimat, paket:paket_id (id, nama, folder_id, kolom)')
      // dropdown jenis perubahan: di data, jenis nempel sebagai "|jenis" di akhir tiap kata
      if (jenisFilter) q = q.ilike('kata_baru', jenisFilter === '*' ? '%|%' : `%|${jenisFilter}%`)
      if (term) q = q.or(`jp.ilike.%${term}%,arti.ilike.%${term}%,kata_baru.ilike.%${term}%`)
      const { data, error } = await q.limit(200)
      if (!error) {
        const termLower = term.toLowerCase()
        // KAMUS: satu entri per kata (Buku + Harian digabung), isinya arti, bentuk-bentuk berubahnya,
        // dan beberapa contoh kalimat dari Buku (kolom contoh) dan Harian (kalimat yang memuat kata itu)
        const entri = new Map()
        const ambilEntri = (kata, arti, paket, rowId) => {
          const kunci = kunciKata(kata)
          let e = entri.get(kunci)
          if (!e) { e = { id: kunci, kata, arti: '', bentuk: [], contoh: [], paket, rowId }; entri.set(kunci, e) }
          if (e.rowId == null && rowId != null) e.rowId = rowId
          if (!e.arti && arti) e.arti = arti
          if (!e.paket && paket) e.paket = paket
          return e
        }
        const tambahContoh = (e, jp, arti, paket, rowId) => {
          const kunci = kunciKata(jp)
          if (!kunci || e.contoh.some(c => c.kunci === kunci)) return
          e.contoh.push({ kunci, jp: tanpaRomaji(jp), arti: arti || '', paket, rowId })
        }
        ;(data || []).forEach(row => {
          const sisi = row.paket ? sisiItem({ tipe: 'paket', data: row.paket }) : 'kiri'
          if (sisi === 'kanan') {
            parseKataBaru(row.kata_baru)
              .filter(w => !jenisFilter || (jenisFilter === '*' ? (w.bentuk || w.jenis) : w.jenis === jenisFilter))
              .filter(w => !term || [w.kata, w.arti, w.bentuk, w.jenis].some(x => x.toLowerCase().includes(termLower)))
              .forEach(w => {
                const e = ambilEntri(w.kata, w.arti, row.paket, row.id)
                if ((w.bentuk || w.jenis) && !e.bentuk.some(b => b.bentuk === w.bentuk && b.jenis === w.jenis)) e.bentuk.push({ bentuk: w.bentuk, jenis: w.jenis })
                tambahContoh(e, row.jp, row.arti, row.paket, row.id)
              })
            return
          }
          if (jenisFilter) return // jenis perubahan cuma ada di Harian
          // BUKU: kata biasa (kanji/kana atau arti); contoh kalimatnya ikut jadi contoh
          const cocokNormal = row.jp?.toLowerCase().includes(termLower) || row.arti?.toLowerCase().includes(termLower)
          if (cocokNormal) {
            const e = ambilEntri(tanpaRomaji(row.jp), row.arti, row.paket, row.id)
            if (row.contoh_kalimat) tambahContoh(e, row.contoh_kalimat, '', row.paket, row.id)
          }
        })
        setKamusHasil([...entri.values()].slice(0, 50))
      }
      setKamusLoading(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [search, jenisFilter])

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

  // ---------- export hafalan ke Excel ----------
  // Isi: kata yang udah HAFAL, dibagi 3 laman: hafal dari Buku, hafal dari Harian Immersion, dan Bunpou.
  // Di laman Buku/Harian kata dikelompokkan per paket (nama paket di-stabilo biar ketauan batasnya).
  // Tag Bunpou nggak ikut di grup paket; semuanya dikumpulin di laman Bunpou.
  const adalahBunpou = jp => /^bunpou\s*[:：]/i.test(String(jp || '').trim())

  // ubah hasil query kata (hafal=true) jadi list item siap-export.
  // Buku: 1 baris = 1 kata (jp+arti). Harian: 1 baris kalimat bisa jadi BEBERAPA item (1 per kata di
  // kata_baru, dengan arti per kata kalau udah diisi). Kalimat tanpa kata_baru (grammar-only) di-skip.
  function flattenExportItems(data) {
    const hasil = []
    data.forEach(row => {
      const sisi = sisiItem({ tipe: 'paket', data: { folder_id: row.paket?.folder_id ?? null, kolom: row.paket?.kolom } })
      const info = { nama: row.paket?.nama, urutan: row.paket?.urutan, paketId: row.paket?.id, sisi }
      if (sisi === 'kanan') {
        if (!row.kata_baru) return
        parseKataBaru(row.kata_baru).forEach(w => hasil.push({ jp: w.kata, arti: w.arti, ...info }))
      } else {
        hasil.push({ jp: row.jp, arti: row.arti, ...info })
      }
    })
    return hasil
  }

  async function exportExcelHafalan() {
    setExportLoading(true)
    try {
      const { data, error } = await fetchAll(() => supabase
        .from('kata')
        .select('jp, arti, kata_baru, urutan, created_at, paket:paket_id (id, nama, urutan, folder_id, kolom)')
        .eq('hafal', true)
        .order('id'))
      if (error) throw error
      // urutan kata di dalam paket = urutan di app (kolom urutan, kalau kosong pakai waktu dibuat)
      const urutanEfektif = k => k.urutan ?? new Date(k.created_at).getTime()
      const items = flattenExportItems([...(data || [])].sort((a, b) => urutanEfektif(a) - urutanEfektif(b)))
      if (items.length === 0) { alert('Belum ada kata yang hafal nih!'); return }

      // 3 laman: hafal dari Buku, hafal dari Harian Immersion, dan Bunpou (dari semua paket, dua sisi)
      const bukan = it => !adalahBunpou(it.jp)
      const itemsBuku = items.filter(it => it.sisi === 'kiri' && bukan(it))
      const itemsHarian = items.filter(it => it.sisi === 'kanan' && bukan(it))
      // Bunpou: yang persis sama (tulisan + arti) cuma ditampilkan sekali
      const bunpou = []
      const sudah = new Set()
      // urut sesuai urutan paket (sort stabil, jadi urutan kata di dalam paket tetap)
      items.filter(it => adalahBunpou(it.jp)).sort((a, b) => (a.urutan ?? 0) - (b.urutan ?? 0)).forEach(it => {
        const kunci = kunciKata(it.jp) + '|' + String(it.arti || '').trim().toLowerCase()
        if (!sudah.has(kunci)) { sudah.add(kunci); bunpou.push(it) }
      })
      // kelompokkan per paket, urut sesuai urutan paket
      const perPaket = list => {
        const peta = new Map()
        list.forEach(it => {
          const id = it.paketId ?? it.nama ?? 'tanpa-paket'
          if (!peta.has(id)) peta.set(id, { nama: it.nama || 'Tanpa paket', urutan: it.urutan ?? 0, items: [] })
          peta.get(id).items.push(it)
        })
        return [...peta.values()].sort((a, b) => a.urutan - b.urutan)
      }

      const ExcelJS = await loadExcelJS()
      const wb = new ExcelJS.Workbook()
      const tgl = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })

      // baris judul yang di-stabilo (nama paket / "Bunpou")
      const barisJudul = (ws, teks, warna) => {
        ws.addRow([])
        const r = ws.addRow([teks, ''])
        ws.mergeCells(`A${r.number}:B${r.number}`)
        ;[1, 2].forEach(i => { r.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: warna } } })
        r.getCell(1).font = { bold: true, size: 12, color: { argb: 'FF1F4D36' } }
        r.getCell(1).alignment = { vertical: 'middle' }
        r.height = 24
      }
      const barisItem = (ws, it) => {
        const r = ws.addRow([it.jp, it.arti || ''])
        r.getCell(1).font = { name: 'MS Mincho', size: 13 }
        ;[1, 2].forEach(i => {
          r.getCell(i).alignment = { vertical: 'middle', wrapText: true }
          r.getCell(i).border = { bottom: { style: 'hair', color: { argb: 'FFBBBBBB' } } }
        })
      }
      // satu laman: judul + ringkasan + header JP/Arti (dibekukan), lalu isinya
      const buatLaman = (namaLaman, judul, ringkas, isi, kosongTeks) => {
        const ws = wb.addWorksheet(namaLaman)
        ws.columns = [{ width: 42 }, { width: 52 }]
        ws.addRow([judul])
        ws.mergeCells('A1:B1')
        ws.getCell('A1').font = { bold: true, size: 15, color: { argb: 'FF2D6A4A' } }
        ws.addRow([`Diekspor: ${tgl} · ${ringkas}`])
        ws.mergeCells('A2:B2')
        ws.getCell('A2').font = { size: 10, color: { argb: 'FF7AAA8A' } }
        const kepala = ws.addRow(['JP', 'Arti'])
        kepala.eachCell(c => { c.font = { bold: true, color: { argb: 'FF2D6A4A' } }; c.border = { bottom: { style: 'medium', color: { argb: 'FF2D6A4A' } } } })
        ws.views = [{ state: 'frozen', ySplit: 3 }]
        if (isi.length === 0) {
          ws.addRow([])
          const r = ws.addRow([kosongTeks])
          ws.mergeCells(`A${r.number}:B${r.number}`)
          r.getCell(1).font = { italic: true, color: { argb: 'FF999999' } }
          return
        }
        isi.forEach(p => {
          if (p.items) { barisJudul(ws, p.nama, 'FFC6EDB8'); p.items.forEach(it => barisItem(ws, it)) } // stabilo hijau per paket
          else { barisJudul(ws, 'Bunpou (dikumpulin dari semua paket)', 'FFFFC2E0'); p.semua.forEach(it => barisItem(ws, it)) } // stabilo pink
        })
      }

      buatLaman('Hafal Buku', 'Kotoba Immersion — Hafalan dari Buku', `${itemsBuku.length} kata`, perPaket(itemsBuku), 'Belum ada kata hafal dari Buku.')
      buatLaman('Hafal Harian Immersion', 'Kotoba Immersion — Hafalan dari Harian Immersion', `${itemsHarian.length} kata`, perPaket(itemsHarian), 'Belum ada kata hafal dari Harian Immersion.')
      buatLaman('Bunpou', 'Kotoba Immersion — Bunpou', `${bunpou.length} bunpou`, bunpou.length ? [{ semua: bunpou }] : [], 'Belum ada bunpou dari kata yang sudah hafal.')

      const buf = await wb.xlsx.writeBuffer()
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `kosakata-hafalan-${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert('Gagal bikin Excel: ' + e.message)
    } finally {
      setExportLoading(false)
    }
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
      // hapus dulu semua file PDF paket-paket di dalam folder ini (dan sub-foldernya)
      // dari storage yang sesuai, biar nggak jadi file "orphan" yang numpuk
      const paketTerkait = paketList.filter(p => idTurunan.includes(p.folder_id))
      const pdfPaths = paketTerkait.map(p => p.pdf_path).filter(Boolean)
      if (pdfPaths.length > 0) {
        const sisi = sisiItem({ tipe: 'folder', data: f })
        const { error: storageErr } = await clientStorageUntuk(sisi).storage.from('immersion-pdfs').remove(pdfPaths)
        if (storageErr) {
          console.error('Gagal hapus sebagian/semua PDF dari storage:', storageErr.message)
        }
      }
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

  function clientStorageUntuk(sisi) {
    return sisi === 'kanan' ? supabaseStorage : supabase
  }

  async function hapusPaket(p) {
    if (!confirm(`Hapus paket "${p.nama}" beserta semua katanya?`)) return
    // hapus dulu file PDF-nya (kalau ada) dari storage yang sesuai (kiri/kanan),
    // biar nggak jadi file "orphan" yang numpuk terus di storage
    if (p.pdf_path) {
      const sisi = sisiItem({ tipe: 'paket', data: p })
      const { error: storageErr } = await clientStorageUntuk(sisi).storage.from('immersion-pdfs').remove([p.pdf_path])
      if (storageErr) {
        // tetap lanjut hapus row database-nya, tapi kasih tau kalau file PDF-nya gagal kehapus
        console.error('Gagal hapus PDF dari storage:', storageErr.message)
      }
    }
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

  // ----- tes perubahan kata: pilih mode dulu (acak / satu jenis), latihan santai (tidak mengubah status hafal) -----
  async function mulaiTesUbah() {
    setTesUbah({ loading: true })
    const { data, error } = await fetchAll(() => supabase
      .from('kata')
      .select('id, jp, kata_baru, paket:paket_id (id, nama)')
      .ilike('kata_baru', '%|%')
      .order('id'))
    if (error) { alert('Gagal ambil soal: ' + error.message); setTesUbah(null); return }
    // satu soal = satu kata + satu jenis. Semua bentuk yang pernah dicatat untuk kombinasi itu
    // (misal 過ごせます dan 過ごせません sama-sama 可能形) jadi "varian" yang sama-sama dianggap benar.
    const peta = new Map()
    ;(data || []).forEach(row => {
      parseKataBaru(row.kata_baru).filter(w => w.bentuk && w.jenis).forEach(w => {
        const kunci = `${kunciKata(w.kata)}|${w.jenis}`
        let e = peta.get(kunci)
        if (!e) { e = { kunci, kata: w.kata, arti: w.arti, jenis: w.jenis, varian: [] }; peta.set(kunci, e) }
        if (!e.arti && w.arti) e.arti = w.arti
        const kb = kunciKata(w.bentuk)
        let v = e.varian.find(x => x.kunci === kb)
        if (!v) { v = { kunci: kb, bentuk: w.bentuk, kalimat: [] }; e.varian.push(v) }
        const kal = tanpaRomaji(row.jp)
        if (kal && !v.kalimat.includes(kal)) v.kalimat.push(kal)
      })
    })
    const semua = [...peta.values()]
    if (semua.length === 0) {
      alert('Belum ada kata yang diisi bentuk & jenis perubahannya. Isi dulu lewat form Edit Kata di paket Harian ya.')
      setTesUbah(null)
      return
    }
    setTesUbah({ pilih: true, semua })
  }
  // jenis '*' = acak dari semua jenis; selain itu = satu jenis saja (misal 可能形)
  function mulaiLatihanUbah(semua, jenis) {
    const items = shuffle(jenis === '*' ? semua : semua.filter(x => x.jenis === jenis))
    if (items.length === 0) return
    setTesUbah({ semua, jenis, items, idx: 0, input: '', answered: false, benar: false, skorBenar: 0, skorSalah: 0 })
  }
  function tesUbahCek() {
    setTesUbah(t => {
      if (!t || t.answered) return t
      const val = t.input.trim()
      if (!val) return t
      const benar = t.items[t.idx].varian.some(v => v.kunci === kunciKata(val))
      return { ...t, answered: true, benar, skorBenar: t.skorBenar + (benar ? 1 : 0), skorSalah: t.skorSalah + (benar ? 0 : 1) }
    })
  }
  function tesUbahLanjut() {
    setTesUbah(t => ({ ...t, idx: t.idx + 1, input: '', answered: false, benar: false }))
  }
  function renderTesUbah() {
    const t = tesUbah
    if (!t) return null
    if (t.loading) {
      return (
        <div className="modal-overlay open">
          <div className="modal-box"><div style={{ textAlign: 'center', color: '#9abaa8', padding: 20 }}>Memuat soal...</div></div>
        </div>
      )
    }
    if (t.pilih) {
      const hitung = {}
      t.semua.forEach(x => { hitung[x.jenis] = (hitung[x.jenis] || 0) + 1 })
      const daftarJenis = JENIS_PERUBAHAN.filter(j => hitung[j.nilai])
      return (
        <div className="modal-overlay open">
          <div className="modal-box" style={{ maxWidth: 380 }}>
            <div style={{ fontWeight: 700, fontSize: 16, textAlign: 'center', marginBottom: 4 }}>Mau latihan apa?</div>
            <div style={{ fontSize: 11, color: '#9abaa8', textAlign: 'center', marginBottom: 12 }}>Latihan santai, tidak mengubah status hafal.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button className="act-btn" style={{ textAlign: 'left' }} onClick={() => mulaiLatihanUbah(t.semua, '*')}>
                🔀 Acak semua jenis · {t.semua.length} soal
              </button>
              {daftarJenis.map(j => (
                <button key={j.nilai} className="act-btn" style={{ textAlign: 'left' }} onClick={() => mulaiLatihanUbah(t.semua, j.nilai)}>
                  {j.label} · {hitung[j.nilai]} soal
                </button>
              ))}
            </div>
            <div className="modal-btns" style={{ marginTop: 12 }}>
              <button onClick={() => setTesUbah(null)}>Tutup</button>
            </div>
          </div>
        </div>
      )
    }
    const selesai = t.idx >= t.items.length
    const w = selesai ? null : t.items[t.idx]
    const jenisLabel = w ? (JENIS_PERUBAHAN.find(j => j.nilai === w.jenis)?.label || w.jenis) : ''
    // semua kalimat dari semua varian, tanpa duplikat; tiap kalimat menebalkan bentuk yang cocok
    const semuaKalimat = []
    if (w) w.varian.forEach(v => v.kalimat.forEach(k => { if (!semuaKalimat.some(x => x.kal === k)) semuaKalimat.push({ kal: k, bentuk: v.bentuk }) }))
    const labelMode = t.jenis === '*' ? 'acak' : (JENIS_PERUBAHAN.find(j => j.nilai === t.jenis)?.label || t.jenis)
    return (
      <div className="modal-overlay open">
        <div className="modal-box" style={{ maxWidth: 480 }}>
          {!selesai ? (
            <>
              <div style={{ fontSize: 11, color: '#9abaa8', marginBottom: 6 }}>{t.idx + 1} / {t.items.length} · ✓ {t.skorBenar} · ✗ {t.skorSalah} · {labelMode}</div>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: '#9abaa8', marginBottom: 4 }}>Ubah ke bentuk:</div>
              <div style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 24, fontWeight: 600, textAlign: 'center' }}>
                {w.kata} <span style={{ color: '#9abaa8' }}>+</span> {jenisLabel}
              </div>
              {w.arti && <div style={{ textAlign: 'center', fontSize: 12, color: '#7a8a80', margin: '4px 0 14px' }}>{w.arti}</div>}
              <input
                key={t.idx} autoFocus value={t.input} readOnly={t.answered}
                placeholder="ketik bentuknya…"
                onChange={e => setTesUbah(x => ({ ...x, input: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && (t.answered ? tesUbahLanjut() : tesUbahCek())}
                style={{
                  textAlign: 'center', fontSize: 18, fontFamily: "'Noto Serif JP', serif", width: '100%', boxSizing: 'border-box',
                  borderColor: t.answered ? (t.benar ? '#1e7d4f' : '#c0392b') : undefined,
                }}
              />
              {t.answered && (
                <div style={{ textAlign: 'center', fontSize: 13, margin: '10px 0 4px', fontWeight: 600, color: t.benar ? '#1e7d4f' : '#c0392b' }}>
                  {t.benar
                    ? '✓ Benar! 🎉'
                    : <>✗ Jawaban: <span style={{ fontFamily: "'Noto Serif JP', serif" }}>{w.varian.map(v => v.bentuk).join(' / ')}</span></>}
                </div>
              )}
              {t.answered && w.varian.length > 1 && (
                <div style={{ textAlign: 'center', fontSize: 12, color: '#7a8a80', marginBottom: 4 }}>
                  {w.varian.length} bentuk tercatat: <span style={{ fontFamily: "'Noto Serif JP', serif" }}>{w.varian.map(v => v.bentuk).join(' · ')}</span>
                </div>
              )}
              {t.answered && semuaKalimat.length > 0 && (
                <div style={{ background: '#f0f7f0', borderRadius: 10, padding: '10px 12px', margin: '8px 0 4px', textAlign: 'left', maxHeight: 220, overflowY: 'auto' }}>
                  <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: '#7aaa8a', marginBottom: 6 }}>Contoh kalimat</div>
                  {semuaKalimat.map((x, i) => (
                    <div key={i} style={{ display: 'flex', gap: 6, fontFamily: "'Noto Serif JP', serif", fontSize: 14, lineHeight: 1.7, marginTop: i ? 6 : 0 }}>
                      <span style={{ flexShrink: 0 }}>·</span>
                      <span>{sorotKalimat(x.kal, x.bentuk)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="modal-btns">
                <button onClick={() => setTesUbah(null)}>Tutup</button>
                <button className="confirm" onClick={t.answered ? tesUbahLanjut : tesUbahCek}>
                  {t.answered ? (t.idx + 1 >= t.items.length ? 'Lihat Hasil' : 'Lanjut →') : 'Cek Jawaban'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 36, textAlign: 'center', marginBottom: 6 }}>{t.skorBenar / t.items.length >= 0.8 ? '🎉' : t.skorBenar / t.items.length >= 0.5 ? '💪' : '📚'}</div>
              <div style={{ fontSize: 32, fontWeight: 700, textAlign: 'center', marginBottom: 4 }}>{t.skorBenar}/{t.items.length}</div>
              <div style={{ fontSize: 12, color: '#9abaa8', textAlign: 'center', marginBottom: 14 }}>{labelMode}</div>
              <div className="modal-btns">
                <button onClick={() => setTesUbah(null)}>Selesai</button>
                <button onClick={() => setTesUbah({ pilih: true, semua: t.semua })}>Ganti mode</button>
                <button className="confirm" onClick={() => mulaiLatihanUbah(t.semua, t.jenis)}>Ulangi</button>
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  // buka paket dari hasil kamus; kalimat yang dituju dititipkan supaya paket langsung scroll ke situ dan menyala 3 detik
  function bukaPaketDariKamus(paket, rowId) {
    if (!paket?.id) return
    if (rowId != null) {
      try { localStorage.setItem('lompatKalimat', JSON.stringify({ paketId: String(paket.id), kataId: String(rowId), t: Date.now() })) } catch { /* abaikan */ }
    }
    openPaket(paket.id)
  }

  const term = search.trim()
  const sedangCari = !!term || !!jenisFilter
  const namaPaketDitemukan = useMemo(() => {
    const set = new Set(kamusHasil.flatMap(k => [k.paket?.nama, ...k.contoh.map(c => c.paket?.nama)]).filter(Boolean))
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
    const { persen } = progresFolder(f.id)
    return (
      <div className="paket-row">
        <div className="urutan-col">
          <button onClick={() => pindahUrutanGabungan({ tipe: 'folder', data: f, urutan: f.urutan ?? 0 }, -1, sisi)} disabled={idx === 0}>▲</button>
          <button onClick={() => pindahUrutanGabungan({ tipe: 'folder', data: f, urutan: f.urutan ?? 0 }, 1, sisi)} disabled={idx === itemsLen - 1}>▼</button>
        </div>
        <div className="info" onClick={onOpen}>
          <div className="nama"><span>📁 {f.nama}</span></div>
          {persen !== null && (
            <div className="progres-folder" title={`${persen}% kata udah hafal`}>
              <div className="progres-folder-bar" style={{ width: `${persen}%` }} />
            </div>
          )}
        </div>
        <button className="icon-btn" title="Pindahkan ke folder lain" onClick={() => setMovePicker({ type: 'folder', item: f })}>➜</button>
        <button className="icon-btn" title="Rename folder" onClick={() => renameFolder(f)}>✏️</button>
        <button className="icon-btn danger" title="Hapus folder" onClick={() => hapusFolder(f)}>✕</button>
      </div>
    )
  }

  function RowPaket({ p, idx, itemsLen, sisi, allowReorder = true }) {
    const persen = p.jumlahKata > 0 ? Math.round((p.jumlahHafal / p.jumlahKata) * 100) : null
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
          {persen !== null && (
            <div className="progres-folder" title={`${persen}% kata udah hafal`}>
              <div className="progres-folder-bar" style={{ width: `${persen}%` }} />
            </div>
          )}
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
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <ImportExcel
            mode="root" sisi={sisi} folderId={currentId} onDone={muatData}
            urutanAwal={items.length ? Math.max(...items.map(i => i.urutan ?? 0)) + 1 : 0}
          />
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
      <div className="cover-inner paket-list-wide">
        <div className="cover-head" style={{ position: 'relative' }}>
          {/* Tombol ← ke cover: ikut ke-scroll bareng halaman (nggak melayang), nempel di pojok kanan atas
              dengan tepi kanan lurus dengan kotak Tes Perubahan Kata & kotak-kotak di bawahnya */}
          <button
            className="back-fab" onClick={() => goTo('cover')}
            style={{ position: 'absolute', top: 'auto', left: 'auto', right: 0, bottom: 'calc(100% + 18px)' }}
          >←</button>
          <div className="cover-emoji">📚</div>
          <div>
            <div className="cover-title" style={{ fontSize: 22 }}>Kotoba Immersion</div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 8 }}>
            <button
              className="icon-btn" title="Download daftar hafalan ke Excel" onClick={exportExcelHafalan}
              disabled={exportLoading}
              style={{ width: 40, height: 40, fontSize: 10, fontWeight: 700 }}
            >
              {exportLoading ? '⏳' : 'Excel'}
            </button>
            {streak > 0 && (
              <div
                title={aktifHariIni
                  ? `Streak ${streak} hari berturut-turut`
                  : `Streak ${streak} hari -- ayo belajar!`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 700,
                  borderRadius: 999, padding: '6px 12px',
                  color: aktifHariIni ? '#e07b1a' : '#8a8a8a',
                  background: aktifHariIni ? '#fff3e6' : '#eeeeee',
                }}
              >
                <span style={{ filter: aktifHariIni ? 'none' : 'grayscale(100%)' }}>🔥</span> {streak} hari
              </div>
            )}
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
            <button
              className="act-btn" onClick={mulaiTesUbah} title="Latihan menebak perubahan bentuk kata"
              style={{ width: 165, height: 38, borderRadius: 12, padding: '0 6px', margin: 0, boxSizing: 'border-box', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
            >📝 Tes Perubahan Kata</button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', marginBottom: 18 }}>
          <input
            className="input-search" placeholder="🔍 Cari kata (kanji/kana atau artinya)..."
            value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1, minWidth: 0, margin: 0 }}
          />
          <select
            value={jenisFilter} onChange={e => setJenisFilter(e.target.value)}
            title="Cari kata berdasarkan jenis perubahannya"
            style={{ margin: 0, padding: '0 10px', borderRadius: 12, border: '1.5px solid #b8d8b8', background: '#fff', fontSize: 13, fontFamily: 'inherit', width: 165, flexShrink: 0, outline: 'none' }}
          >
            <option value="">Semua kata</option>
            <option value="*">Ada perubahan (semua)</option>
            {JENIS_PERUBAHAN.map(j => <option key={j.nilai} value={j.nilai}>{j.label}</option>)}
          </select>
        </div>

        {loading && <div style={{ textAlign: 'center', color: '#9abaa8', padding: 20 }}>Memuat...</div>}

        {!loading && !sedangCari && (
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

        {!loading && sedangCari && (
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
                    {jenisFilter ? 'Belum ada kata dengan perubahan itu' : `Gak ketemu kata "${search}"`}
                  </div>
                )}

                {kamusHasil.map(k => {
                  const buka = kamusBuka.has(k.id)
                  const tampil = buka ? k.contoh : k.contoh.slice(0, 3)
                  // contoh digabung per paket: tombol paket cuma di contoh pertama tiap paket
                  const grup = []; const peta = {}
                  tampil.forEach(c => {
                    const id = c.paket?.id ?? '_'
                    if (!peta[id]) { peta[id] = { paket: c.paket, items: [] }; grup.push(peta[id]) }
                    peta[id].items.push(c)
                  })
                  if (grup.length === 0 && k.paket) grup.push({ paket: k.paket, items: [] })
                  return (
                    <div key={k.id} className="paket-row" style={{ cursor: 'default' }}>
                      <div className="info">
                        <div className="nama" style={{ userSelect: 'text', WebkitUserSelect: 'text' }}>
                          <span style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 16 }}>{k.kata}</span>
                          {k.arti && <span style={{ fontSize: 13, color: '#555' }}> — {k.arti}</span>}
                        </div>
                        {k.bentuk.length > 0 && (
                          <div className="meta" style={{ display: 'block' }}>
                            {k.bentuk.map((b, i) => (
                              <span key={i} style={{ marginRight: 10 }}>
                                <span style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 14 }}>{b.bentuk}</span>
                                {b.jenis && <span style={{ marginLeft: 5, fontSize: 11, background: '#e8f3e8', borderRadius: 8, padding: '1px 7px' }}>{b.jenis}</span>}
                              </span>
                            ))}
                          </div>
                        )}
                        {grup.map((g, gi) => (
                          <div key={gi} style={{ marginTop: 8 }}>
                            {g.paket && (
                              <button
                                title={g.paket.nama}
                                onClick={e => { e.stopPropagation(); bukaPaketDariKamus(g.paket, g.items[0]?.rowId ?? k.rowId) }}
                                style={{
                                  display: 'block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                  border: '1px solid #b9d9c0', background: '#f3faf4', color: '#3d7a58', borderRadius: 999,
                                  padding: '2px 12px', fontSize: 11, cursor: 'pointer', marginBottom: 2,
                                }}
                              >
                                › {g.paket.nama}
                              </button>
                            )}
                            {g.items.map((c, i) => (
                              <div key={i} style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                {/* garis putus per kalimat: cuma area ini yang bisa diklik, langsung ke kalimatnya di paket */}
                                <div
                                  title={g.paket ? `Ke kalimat ini di ${g.paket.nama}` : ''}
                                  onClick={e => { e.stopPropagation(); bukaPaketDariKamus(g.paket, c.rowId) }}
                                  onMouseEnter={e => { const l = e.currentTarget.firstChild; if (l) l.style.borderLeftColor = '#5f9f78' }}
                                  onMouseLeave={e => { const l = e.currentTarget.firstChild; if (l) l.style.borderLeftColor = '#b9d9c0' }}
                                  style={{ width: 14, flexShrink: 0, alignSelf: 'stretch', cursor: g.paket ? 'pointer' : 'default', display: 'flex', justifyContent: 'center' }}
                                >
                                  <div style={{ width: 0, height: '100%', minHeight: 20, borderLeft: '3px solid #b9d9c0', borderRadius: 2, transition: 'border-color .15s' }} />
                                </div>
                                <div className="meta" style={{ display: 'block', flex: 1, minWidth: 0, userSelect: 'text', WebkitUserSelect: 'text', cursor: 'text' }}>
                                  <span style={{ fontFamily: "'Noto Serif JP', serif" }}>{c.jp}</span>
                                  {c.arti && <span> — {c.arti}</span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        ))}
                        {k.contoh.length > 3 && (
                          <div
                            style={{ fontSize: 11, color: '#7aaa8a', marginTop: 6, cursor: 'pointer' }}
                            onClick={e => {
                              e.stopPropagation()
                              setKamusBuka(prev => { const n = new Set(prev); n.has(k.id) ? n.delete(k.id) : n.add(k.id); return n })
                            }}
                          >
                            {buka ? 'Sembunyikan contoh' : `+${k.contoh.length - 3} contoh lagi`}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
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
      {renderTesUbah()}
    </div>
  )
}
